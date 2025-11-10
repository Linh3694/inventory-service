const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Models
const Monitor = require('../models/Monitor');
const Laptop = require('../models/Laptop');
const Phone = require('../models/Phone');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Tool = require('../models/Tool');
const Activity = require('../models/Activity');
const User = require('../models/User');

const models = [Monitor, Laptop, Phone, Printer, Projector, Tool, Activity];

async function connectDB() {
  const uri =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'inventory_service'}`;

  const options = {
    autoIndex: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4,
  };

  try {
    await mongoose.connect(uri, options);
    console.log('✅ MongoDB connected\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function fetchUserFromFrappe(email) {
  try {
    const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000';
    const apiToken = process.env.FRAPPE_API_TOKEN;

    if (!apiToken) {
      console.log('   ⚠️  FRAPPE_API_TOKEN not configured, skipping Frappe fetch');
      return null;
    }

    const response = await axios.get(`${frappeUrl}/api/method/frappe.client.get`, {
      params: {
        doctype: 'User',
        name: email,
      },
      headers: {
        Authorization: `token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    });

    if (response.data && response.data.message) {
      return response.data.message;
    }

    return null;
  } catch (error) {
    console.log(`   ⚠️  Could not fetch from Frappe (${email}): ${error.message}`);
    return null;
  }
}

async function getOrFetchUserFullname(userId, fallbackName = null) {
  try {
    const user = await User.findById(userId);

    if (!user) {
      console.log(`   ⚠️  User not found in MongoDB: ${userId}`);
      return null;
    }

    // If user has fullname, use it
    if (user.fullname && user.fullname.trim()) {
      return user.fullname;
    }

    if (user.fullName && user.fullName.trim()) {
      return user.fullName;
    }

    // Try to sync from Frappe
    const email = user.email || user.frappeUserId;
    if (email) {
      console.log(`   📡 Attempting Frappe sync for: ${email}`);
      const frappeUser = await fetchUserFromFrappe(email);

      if (frappeUser) {
        const fullName =
          frappeUser.full_name ||
          frappeUser.fullname ||
          frappeUser.fullName ||
          [frappeUser.first_name, frappeUser.middle_name, frappeUser.last_name]
            .filter(Boolean)
            .join(' ') ||
          frappeUser.name;

        if (fullName && fullName.trim()) {
          user.fullname = fullName;
          user.fullName = fullName;
          await user.save();
          console.log(`   ✅ Synced from Frappe: ${fullName}`);
          return fullName;
        }
      }
    }

    // Use fallback name if provided
    if (fallbackName && fallbackName.trim()) {
      console.log(`   ℹ️  Using fallback name: ${fallbackName}`);
      user.fullname = fallbackName;
      user.fullName = fallbackName;
      await user.save();
      return fallbackName;
    }

    console.log(`   ❌ Could not determine fullname for user: ${userId}`);
    return null;
  } catch (error) {
    console.error(`   ❌ Error processing user ${userId}:`, error.message);
    return null;
  }
}

async function fixNullFullnames() {
  let totalFixed = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const Model of models) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 Processing ${Model.modelName}...`);
    console.log('='.repeat(70));

    try {
      const documents = await Model.find({});
      console.log(`   Found ${documents.length} ${Model.modelName} documents\n`);

      let modelFixed = 0;

      for (const doc of documents) {
        if (!doc.assignmentHistory || doc.assignmentHistory.length === 0) {
          continue;
        }

        let docChanged = false;

        for (let i = 0; i < doc.assignmentHistory.length; i++) {
          const history = doc.assignmentHistory[i];

          // Check if fullname is null or missing
          if (
            history.user &&
            (!history.fullname || history.fullname === null || history.fullname === undefined)
          ) {
            const fallbackName = history.userName;
            const fullname = await getOrFetchUserFullname(history.user, fallbackName);

            if (fullname) {
              doc.assignmentHistory[i].fullname = fullname;
              docChanged = true;
              totalFixed++;
              modelFixed++;
              console.log(
                `   ✏️  Fixed: ${Model.modelName} (${doc._id}) - History ${history._id} -> ${fullname}`
              );
            } else {
              console.log(
                `   ⏭️  Skipped: ${Model.modelName} (${doc._id}) - History ${history._id} (could not determine fullname)`
              );
              totalSkipped++;
            }
          }
        }

        // Save if document was changed
        if (docChanged) {
          try {
            await doc.save();
            console.log(`   💾 Saved ${Model.modelName} (${doc._id})`);
          } catch (error) {
            console.error(`   ❌ Error saving ${Model.modelName} (${doc._id}):`, error.message);
            totalErrors++;
          }
        }
      }

      console.log(`\n   ✅ ${Model.modelName}: Fixed ${modelFixed} entries`);
    } catch (error) {
      console.error(`❌ Error processing ${Model.modelName}:`, error.message);
      totalErrors++;
    }

    // Add delay between models
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL SUMMARY:');
  console.log('='.repeat(70));
  console.log(`   ✅ Total fixed: ${totalFixed}`);
  console.log(`   ⏭️  Total skipped: ${totalSkipped}`);
  console.log(`   ❌ Total errors: ${totalErrors}`);
  console.log('='.repeat(70));

  return { totalFixed, totalSkipped, totalErrors };
}

async function main() {
  try {
    await connectDB();
    console.log('🚀 Starting comprehensive fix for null fullnames in assignment history...');
    console.log('   This will attempt to sync from Frappe for missing data\n');

    const result = await fixNullFullnames();

    if (result.totalErrors === 0) {
      console.log('\n✅ All fixes completed successfully!');
      if (result.totalSkipped > 0) {
        console.log(`   ⚠️  ${result.totalSkipped} entries were skipped - manual review needed`);
      }
    } else {
      console.log('\n⚠️  Completed with some errors. Please check the logs above.');
    }

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(result.totalErrors === 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

