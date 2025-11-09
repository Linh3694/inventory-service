/**
 * Fix assignment history data from old format
 * 
 * Old issues:
 * 1. Entries with user: null (created by old logic)
 * 2. Missing endDate for closed assignments
 * 3. Inconsistent document field across entries
 * 
 * Run: node scripts/fixAssignmentHistory.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

const MODELS = [
  { name: 'Laptop', model: Laptop },
  { name: 'Monitor', model: Monitor },
  { name: 'Printer', model: Printer },
  { name: 'Projector', model: Projector },
  { name: 'Phone', model: Phone },
  { name: 'Tool', model: Tool }
];

async function fixAssignmentHistory() {
  try {
    console.log('🔧 Starting assignment history fix...\n');

    let totalDevices = 0;
    let fixedDevices = 0;
    let issues = [];

    for (const { name, model } of MODELS) {
      console.log(`\n📋 Processing ${name}s...`);
      
      const devices = await model.find({}).lean();
      totalDevices += devices.length;

      for (const device of devices) {
        let needsFix = false;
        let deviceIssues = [];

        // Skip if no assignment history
        if (!device.assignmentHistory || device.assignmentHistory.length === 0) {
          continue;
        }

        // Check for issues
        for (let i = 0; i < device.assignmentHistory.length; i++) {
          const entry = device.assignmentHistory[i];

          // Issue 1: user is null
          if (!entry.user) {
            deviceIssues.push(`Entry ${i}: Missing user (user: null)`);
            needsFix = true;
          }

          // Issue 2: Last entry missing endDate (should be open)
          const isLastEntry = i === device.assignmentHistory.length - 1;
          if (isLastEntry && entry.user && !entry.endDate && !device.assigned?.includes(entry.user)) {
            deviceIssues.push(`Entry ${i}: Last entry missing endDate but user not in assigned`);
            needsFix = true;
          }

          // Issue 3: Entry with document but no user
          if (entry.document && !entry.user) {
            deviceIssues.push(`Entry ${i}: Has document but no user`);
            needsFix = true;
          }
        }

        if (needsFix) {
          console.log(`\n  ⚠️  Device: ${device.name} (${device._id})`);
          deviceIssues.forEach(issue => console.log(`     - ${issue}`));

          // Fix the device
          const updatedDevice = await model.findById(device._id);

          // Remove entries with null user
          updatedDevice.assignmentHistory = updatedDevice.assignmentHistory.filter(
            entry => entry.user !== null && entry.user !== undefined
          );

          // Ensure last open entry has proper structure
          const lastEntry = updatedDevice.assignmentHistory[updatedDevice.assignmentHistory.length - 1];
          if (lastEntry && !lastEntry.endDate && updatedDevice.assigned?.length > 0) {
            // This is the current holder
            if (!lastEntry.user) {
              lastEntry.user = updatedDevice.assigned[0];
            }
          }

          await updatedDevice.save();
          fixedDevices++;
          console.log(`  ✅ Fixed!`);

          issues.push({
            deviceType: name,
            deviceId: device._id,
            deviceName: device.name,
            issues: deviceIssues
          });
        }
      }

      console.log(`   Total ${name}s: ${devices.length}`);
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('📊 FIX SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total devices: ${totalDevices}`);
    console.log(`Fixed devices: ${fixedDevices}`);
    console.log(`Issues found: ${issues.length}`);

    if (issues.length > 0) {
      console.log('\n📋 Issues fixed:');
      issues.forEach(issue => {
        console.log(`\n  ${issue.deviceType}: ${issue.deviceName}`);
        issue.issues.forEach(i => console.log(`    - ${i}`));
      });
    }

    console.log('\n✅ Migration complete!\n');

  } catch (error) {
    console.error('❌ Error during fix:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Connect to database and run
async function main() {
  try {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/inventory_service';
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected to MongoDB\n');

    await fixAssignmentHistory();

  } catch (error) {
    console.error('Connection error:', error);
    process.exit(1);
  }
}

main();

