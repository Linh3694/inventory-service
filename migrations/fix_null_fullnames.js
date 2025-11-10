/**
 * Migration Script: Fix Users with null fullname
 * 
 * Purpose: Find and fix all User records where fullname is null
 * Strategy:
 *   1. Try to get fullname from Frappe (if API available)
 *   2. Otherwise, extract name from email (e.g., "linh.nguyenhai@wellspring.edu.vn" -> "Linh Nguyenhai")
 * 
 * Run: node migrations/fix_null_fullnames.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory_service';
const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

/**
 * Extract name from email
 * Example: "linh.nguyenhai@wellspring.edu.vn" -> "Linh Nguyenhai"
 */
function extractNameFromEmail(email) {
  if (!email) return 'Unknown User';
  
  const localPart = email.split('@')[0];
  const parts = localPart.split('.');
  
  // Capitalize first letter of each part
  const capitalizedParts = parts.map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );
  
  return capitalizedParts.join(' ');
}

/**
 * Fetch user from Frappe API (optional)
 */
async function fetchFromFrappe(email, token) {
  if (!token) return null;
  
  try {
    const response = await axios.get(
      `${FRAPPE_API_URL}/api/resource/User/${email}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      }
    );
    
    const user = response.data.data;
    return user.full_name || user.first_name || null;
  } catch (error) {
    console.log(`   ⚠️  Could not fetch ${email} from Frappe: ${error.message}`);
    return null;
  }
}

async function fixNullFullnames(frappeToken = null) {
  try {
    console.log('🚀 Starting fix: Users with null fullname');
    console.log(`📍 Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users with null fullname
    const usersWithNullFullname = await User.find({
      $or: [
        { fullname: null },
        { fullname: { $exists: false } },
        { fullname: '' }
      ]
    });

    console.log(`\n📊 Found ${usersWithNullFullname.length} users with null/empty fullname`);

    if (usersWithNullFullname.length === 0) {
      console.log('✨ All users already have fullname! Nothing to fix.');
      return { fixed: 0, failed: 0 };
    }

    let fixed = 0;
    let failed = 0;
    let fromFrappe = 0;
    let fromEmail = 0;

    for (const user of usersWithNullFullname) {
      try {
        let newFullname = null;
        let source = '';

        // PRIORITY 1: Try to get fresh data from Frappe (if token provided)
        // Frappe is the source of truth - always prefer it when available
        if (frappeToken && user.email) {
          newFullname = await fetchFromFrappe(user.email, frappeToken);
          if (newFullname) {
            fromFrappe++;
            source = 'from Frappe API (source of truth)';
          }
        }
        
        // PRIORITY 2: Fallback to old field 'fullName' (capital N) if exists
        // This is legacy data but better than nothing
        if (!newFullname && user.fullName) {
          newFullname = user.fullName;
          source = 'from old fullName field (legacy)';
        }

        // PRIORITY 3: Extract from email as last resort
        if (!newFullname && user.email) {
          newFullname = extractNameFromEmail(user.email);
          fromEmail++;
          source = 'from email extraction (fallback)';
        }

        // PRIORITY 4: Use frappeUserId or "Unknown"
        if (!newFullname) {
          newFullname = user.frappeUserId || user.name || 'Unknown User';
          source = 'fallback (unknown)';
        }

        // Update user with new fullname
        user.fullname = newFullname;
        
        // Clean up old fullName field to avoid confusion
        if (user.fullName) {
          user.fullName = undefined; // Remove deprecated field
        }
        
        await user.save();

        console.log(`   ✅ Fixed: ${user.email || user.frappeUserId} -> "${newFullname}" (${source})`);
        fixed++;
      } catch (error) {
        console.error(`   ❌ Failed to fix ${user.email || user._id}: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Fix completed!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Total users fixed: ${fixed}`);
    console.log(`   - From Frappe API: ${fromFrappe}`);
    console.log(`   - From email extraction: ${fromEmail}`);
    console.log(`   - Failed: ${failed}`);
    console.log('='.repeat(60));

    return { fixed, failed, fromFrappe, fromEmail };
  } catch (error) {
    console.error('\n❌ Fix failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run fix if called directly
if (require.main === module) {
  // Optional: Pass Frappe token as command line argument
  // Usage: node fix_null_fullnames.js [FRAPPE_TOKEN]
  const frappeToken = process.argv[2] || null;
  
  if (frappeToken) {
    console.log('🔑 Frappe token provided - will try to fetch from API');
  } else {
    console.log('ℹ️  No Frappe token provided - will extract names from emails');
    console.log('   To use Frappe API: node fix_null_fullnames.js YOUR_TOKEN');
  }

  fixNullFullnames(frappeToken)
    .then((result) => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { fixNullFullnames, extractNameFromEmail };


