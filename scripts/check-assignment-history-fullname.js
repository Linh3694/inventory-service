#!/usr/bin/env node

/**
 * 🔍 Check Assignment History Fullname Issues
 *
 * Checks how many assignmentHistory entries have null fullname values.
 *
 * Usage:
 *   node scripts/check-assignment-history-fullname.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config.env') });

// Import models
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

const checkAssignmentHistoryFullname = async () => {
  try {
    console.log('🔍 Checking assignmentHistory fullname issues...');
    console.log('');

    // Connect to database
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let totalEntries = 0;
    let totalNullFullname = 0;
    let totalWithUserName = 0;

    // Process each device type
    for (const { name: modelName, model: Model } of deviceModels) {
      console.log(`📱 Checking ${modelName}...`);

      const devices = await Model.find({
        'assignmentHistory.user': { $exists: true }
      }).populate('assignmentHistory.user');

      let modelEntries = 0;
      let modelNullFullname = 0;
      let modelWithUserName = 0;

      for (const device of devices) {
        for (const history of device.assignmentHistory) {
          modelEntries++;

          if (history.user && typeof history.user === 'object') {
            // Check populated user object for null fullname
            if (history.user.fullname === null) {
              modelNullFullname++;
              if (history.userName) {
                modelWithUserName++;
              }
            }
          }
        }
      }

      totalEntries += modelEntries;
      totalNullFullname += modelNullFullname;
      totalWithUserName += modelWithUserName;

      console.log(`   📊 ${modelName}: ${modelNullFullname}/${modelEntries} entries with null fullname (${modelWithUserName} have userName)`);
    }

    console.log('\n🎯 Overall Results:');
    console.log(`   📋 Total assignment history entries: ${totalEntries}`);
    console.log(`   ❌ Entries with null fullname: ${totalNullFullname}`);
    console.log(`   ✅ Entries with userName available: ${totalWithUserName}`);
    console.log(`   📈 Fixable percentage: ${totalNullFullname > 0 ? ((totalWithUserName / totalNullFullname) * 100).toFixed(1) : 0}%`);

    if (totalNullFullname > 0) {
      console.log('\n💡 Recommendation: Run fix-assignment-history-fullname.js to resolve these issues');
    } else {
      console.log('\n✅ No fullname issues found!');
    }

    await mongoose.connection.close();
    console.log('\n🔌 Database disconnected');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Check failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the check
checkAssignmentHistoryFullname();
