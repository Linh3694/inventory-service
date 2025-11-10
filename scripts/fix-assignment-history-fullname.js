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
const Database = require('../config/database');

const deviceModels = [
  'Laptop',
  'Monitor',
  'Printer',
  'Projector',
  'Phone',
  'Tool'
];

const fixAssignmentHistoryFullname = async () => {
  try {
    console.log('🔧 Starting assignmentHistory fullname fix...');
    console.log('');

    // Connect to database
    await Database.connect();

    const User = mongoose.model('User');
    let totalFixed = 0;
    let totalProcessed = 0;

    // Process each device type
    for (const modelName of deviceModels) {
      console.log(`📱 Processing ${modelName}...`);

      const Model = mongoose.model(modelName);
      const devices = await Model.find({
        'assignmentHistory.user': { $exists: true }
      }).populate('assignmentHistory.user');

      let modelFixed = 0;

      for (const device of devices) {
        let deviceUpdated = false;

        for (let i = 0; i < device.assignmentHistory.length; i++) {
          const history = device.assignmentHistory[i];
          totalProcessed++;

          // Check if user.fullname is null
          if (history.user && history.user.fullname === null) {
            let fixedFullname = null;

            // Method 1: Try to get fullname from userName field
            if (history.userName && history.userName.trim()) {
              fixedFullname = history.userName.trim();
              console.log(`   🔄 Using userName: "${fixedFullname}"`);
            }

            // Method 2: Try to get from User collection by email
            if (!fixedFullname && history.user.email) {
              try {
                const userDoc = await User.findOne({ email: history.user.email });
                if (userDoc && userDoc.fullname) {
                  fixedFullname = userDoc.fullname;
                  console.log(`   🔄 Using User collection: "${fixedFullname}"`);
                }
              } catch (err) {
                console.warn(`   ⚠️  Failed to lookup user by email: ${history.user.email}`);
              }
            }

            // Method 3: Try to get from User collection by _id
            if (!fixedFullname && history.user._id) {
              try {
                const userDoc = await User.findById(history.user._id);
                if (userDoc && userDoc.fullname) {
                  fixedFullname = userDoc.fullname;
                  console.log(`   🔄 Using User collection by ID: "${fixedFullname}"`);
                }
              } catch (err) {
                console.warn(`   ⚠️  Failed to lookup user by ID: ${history.user._id}`);
              }
            }

            // If we found a fullname, update it
            if (fixedFullname) {
              device.assignmentHistory[i].user.fullname = fixedFullname;
              deviceUpdated = true;
              modelFixed++;
              console.log(`   ✅ Fixed: ${history.user.email} -> "${fixedFullname}"`);
            } else {
              console.log(`   ❌ Could not fix: ${history.user.email} (no fullname found)`);
            }
          }
        }

        // Save device if any history was updated
        if (deviceUpdated) {
          await device.save();
        }
      }

      if (modelFixed > 0) {
        console.log(`   ✅ ${modelName}: Fixed ${modelFixed} entries`);
      } else {
        console.log(`   ℹ️  ${modelName}: No fixes needed`);
      }
      console.log('');
    }

    console.log('🎉 Fix completed!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🔍 Processed: ${totalProcessed} assignment history entries`);
    console.log(`   ✅ Fixed: ${totalFixed} null fullnames`);
    console.log(`   📈 Success rate: ${totalProcessed > 0 ? ((totalFixed / totalProcessed) * 100).toFixed(1) : 0}%`);

  } catch (error) {
    console.error('❌ Fix failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Disconnect from database
    await Database.disconnect();
    console.log('');
    console.log('🔌 Database disconnected');
  }
};

// Run the fix
fixAssignmentHistoryFullname();
