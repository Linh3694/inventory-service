#!/usr/bin/env node

/**
 * 🔧 Fix Assignment History Fullname
 *
 * Fixes assignmentHistory entries where user.fullname is null by populating
 * the correct fullname from userName or User collection.
 *
 * Usage:
 *   node scripts/fix-assignment-history-fullname.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config.env') });

// Import models
const User = require('../models/User');
const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

const deviceModels = [
  { name: 'Laptop', model: Laptop },
  { name: 'Monitor', model: Monitor },
  { name: 'Printer', model: Printer },
  { name: 'Projector', model: Projector },
  { name: 'Phone', model: Phone },
  { name: 'Tool', model: Tool }
];

const fixAssignmentHistoryFullname = async () => {
  try {
    console.log('🔧 Starting assignmentHistory fullname fix...');
    console.log('');

    // Connect to database
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let totalFixed = 0;
    let totalProcessed = 0;

    // Process each device type
    for (const { name: modelName, model: Model } of deviceModels) {
      console.log(`📱 Processing ${modelName}...`);

      const devices = await Model.find({
        'assignmentHistory.user': { $exists: true }
      }).populate('assignmentHistory.user');

      let modelFixed = 0;

      for (const device of devices) {
        let deviceUpdated = false;

        for (let i = 0; i < device.assignmentHistory.length; i++) {
          const history = device.assignmentHistory[i];
          totalProcessed++;

          // Check if user exists and has null fullname in populated data
          if (history.user && typeof history.user === 'object' && history.user.fullname === null) {
            let fixedFullname = null;

            // Method 1: Try to get fullname from userName field
            if (history.userName && history.userName.trim()) {
              fixedFullname = history.userName.trim();
              console.log(`   🔄 Using userName: "${fixedFullname}"`);
            }

            // Method 2: Try to get from User collection directly (if it has fullname)
            if (!fixedFullname && history.user._id) {
              try {
                const userDoc = await User.findById(history.user._id);
                if (userDoc && userDoc.fullname) {
                  fixedFullname = userDoc.fullname;
                  console.log(`   🔄 Using User collection: "${fixedFullname}"`);
                }
              } catch (err) {
                console.warn(`   ⚠️  Failed to lookup user: ${err.message}`);
              }
            }

            // If we found a fullname, update the User document
            if (fixedFullname) {
              await User.findByIdAndUpdate(history.user._id, { fullname: fixedFullname });
              deviceUpdated = true;
              modelFixed++;
              totalFixed++;
              console.log(`   ✅ Fixed: ${history.user.email} -> "${fixedFullname}"`);
            } else {
              console.log(`   ❌ Could not fix: ${history.user.email} (no fullname source found)`);
            }
          }
        }

        // Note: We're updating User documents directly, no need to save device
      }

      if (modelFixed > 0) {
        console.log(`   ✅ ${modelName}: Fixed ${modelFixed} entries`);
      } else {
        console.log(`   ℹ️  ${modelName}: No fixes needed`);
      }
      console.log('');
    }

    console.log('\n🎉 Fix completed!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🔍 Processed: ${totalProcessed} assignment history entries`);
    console.log(`   ✅ Fixed: ${totalFixed} null fullnames`);
    console.log(`   📈 Success rate: ${totalProcessed > 0 ? ((totalFixed / totalProcessed) * 100).toFixed(1) : 0}%`);

    await mongoose.connection.close();
    console.log('\n🔌 Database disconnected');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fix failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the fix
fixAssignmentHistoryFullname();
