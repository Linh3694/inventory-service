const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

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

/**
 * SAFE FIX: Only updates assignment history fullname with fallback
 * - First: Try to get from User collection
 * - Fallback: Use history.user.fullname or history.userName
 * - NEVER creates new users
 * - NEVER modifies user _id
 */
async function fixAssignmentHistoryWithFallback() {
  console.log('🔒 SAFE MODE: Fixing assignment history fullname\n');
  console.log('Strategy:');
  console.log('  1. Try User collection');
  console.log('  2. Fallback to history.user.fullname');
  console.log('  3. Fallback to history.userName\n');
  console.log('='.repeat(70) + '\n');

  let totalFixed = 0;
  let totalSkipped = 0;
  const missingUserIds = new Set();
  const summary = {
    fixedFromUser: 0,
    fixedFromHistoryFullname: 0,
    fixedFromHistoryUserName: 0,
    skipped: 0,
  };

  for (const Model of models) {
    console.log(`📦 Processing ${Model.modelName}...`);

    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        if (!doc.assignmentHistory || !Array.isArray(doc.assignmentHistory)) {
          continue;
        }

        let docChanged = false;

        for (let i = 0; i < doc.assignmentHistory.length; i++) {
          const history = doc.assignmentHistory[i];

          // Only fix if fullname is null/undefined
          if (
            !history.fullname ||
            history.fullname === null ||
            history.fullname === undefined ||
            history.fullname === ''
          ) {
            let fixedFullname = null;
            let source = null;

            // Strategy 1: Try User collection
            if (history.user && history.user._id) {
              try {
                const user = await User.findById(history.user._id);
                if (user && user.fullname) {
                  fixedFullname = user.fullname;
                  source = 'User collection';
                  summary.fixedFromUser++;
                } else if (!user) {
                  missingUserIds.add(history.user._id.toString());
                }
              } catch (error) {
                // User lookup error, continue to fallback
              }
            }

            // Strategy 2: Fallback to history.user.fullname
            if (!fixedFullname && history.user && history.user.fullname) {
              fixedFullname = history.user.fullname;
              source = 'history.user.fullname';
              summary.fixedFromHistoryFullname++;
            }

            // Strategy 3: Fallback to history.userName
            if (!fixedFullname && history.userName) {
              fixedFullname = history.userName;
              source = 'history.userName';
              summary.fixedFromHistoryUserName++;
            }

            // Apply fix if we found a fullname
            if (fixedFullname) {
              doc.assignmentHistory[i].fullname = fixedFullname;
              docChanged = true;
              totalFixed++;
            } else {
              // No fullname found from any source
              console.log(
                `      ⏭️  Cannot fix: ${Model.modelName} (${doc._id}) - History ${history._id || 'unknown'}`
              );
              summary.skipped++;
              totalSkipped++;
            }
          }
        }

        // Save document if changed
        if (docChanged) {
          try {
            await doc.save();
          } catch (error) {
            console.error(
              `      ❌ Error saving ${Model.modelName} (${doc._id}):`,
              error.message
            );
          }
        }
      }

      console.log(`   ✅ Done\n`);
    } catch (error) {
      console.error(`   ❌ Error processing ${Model.modelName}:`, error.message);
    }
  }

  // Print summary
  console.log('='.repeat(70));
  console.log('\n📊 DETAILED SUMMARY:\n');
  console.log(`   ✅ Fixed from User collection: ${summary.fixedFromUser}`);
  console.log(
    `   ✅ Fixed from history.user.fullname: ${summary.fixedFromHistoryFullname}`
  );
  console.log(`   ✅ Fixed from history.userName: ${summary.fixedFromHistoryUserName}`);
  console.log(`   ⏭️  Skipped (no source found): ${summary.skipped}`);
  console.log(`\n   📊 Total fixed: ${totalFixed}`);

  if (missingUserIds.size > 0) {
    console.log(`\n⚠️  Missing users (not in User collection): ${missingUserIds.size}`);
    const missingArray = Array.from(missingUserIds);
    console.log(`   First 10: ${missingArray.slice(0, 10).join(', ')}`);
    if (missingArray.length > 10) {
      console.log(`   ... and ${missingArray.length - 10} more`);
    }
  }

  return {
    totalFixed,
    totalSkipped,
    missingUserIds: Array.from(missingUserIds),
    summary,
  };
}

/**
 * Fix users with fullname = null from fullName field
 */
async function fixUsersFullnameFromFullName() {
  console.log('Step 1️⃣  Fixing users with fullname = null from fullName field\n');

  let fixed = 0;

  try {
    const users = await User.find({
      fullname: { $in: [null, ''] },
      fullName: { $ne: null, $ne: '' },
    });

    console.log(`   Found ${users.length} users\n`);

    for (const user of users) {
      if (user.fullName && user.fullName.trim()) {
        user.fullname = user.fullName;
        await user.save();
        console.log(`   ✅ Fixed: ${user._id} -> "${user.fullname}"`);
        fixed++;
      }
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  console.log(`\n   Result: Fixed ${fixed} users\n`);
  return fixed;
}

async function main() {
  try {
    await connectDB();

    console.log('🔒 SAFE FIX: Assignment History + Fallback Strategy\n');
    console.log('⚠️  IMPORTANT NOTES:\n');
    console.log('   - NEVER creates new users');
    console.log('   - NEVER modifies _id field');
    console.log('   - Uses fallback strategy for missing fullname');
    console.log('   - Preserves legacy data integrity\n');
    console.log('='.repeat(70) + '\n');

    // Step 1
    const step1 = await fixUsersFullnameFromFullName();

    // Step 2
    console.log('='.repeat(70));
    console.log('\nStep 2️⃣  Fixing assignment history fullname\n');
    const result = await fixAssignmentHistoryWithFallback();

    // Final report
    console.log('='.repeat(70));
    console.log('\n📋 FINAL REPORT:\n');
    console.log(`   Step 1 - Fixed users fullname: ${step1}`);
    console.log(`   Step 2 - Fixed from User collection: ${result.summary.fixedFromUser}`);
    console.log(
      `   Step 2 - Fixed from history.user.fullname: ${result.summary.fixedFromHistoryFullname}`
    );
    console.log(
      `   Step 2 - Fixed from history.userName: ${result.summary.fixedFromHistoryUserName}`
    );
    console.log(`   Step 2 - Skipped (no source): ${result.summary.skipped}`);
    console.log(`\n   🎯 Total Assignment History Fixed: ${result.totalFixed}`);

    if (result.missingUserIds.length > 0) {
      console.log(`\n⚠️  ATTENTION: ${result.missingUserIds.length} user IDs not found in User collection`);
      console.log('   These are likely legacy users that need to be migrated.');
      console.log('   Check MISSING_USERS_TO_INVESTIGATE.txt for details\n');

      // Save missing users to file
      const fs = require('fs');
      const reportPath = '/Users/gau/frappe-bench-mac/inventory-service/scripts/MISSING_USERS_TO_INVESTIGATE.txt';
      const report = [
        'MISSING USERS - Not found in User collection',
        '='.repeat(60),
        `Total missing: ${result.missingUserIds.length}`,
        '',
        'User IDs:',
        ...result.missingUserIds,
      ].join('\n');

      fs.writeFileSync(reportPath, report);
      console.log(`   📄 Report saved to: MISSING_USERS_TO_INVESTIGATE.txt`);
    }

    console.log('\n✅ Safe fix completed!\n');

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

