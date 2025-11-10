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
 * SAFE OPERATION: Only updates existing users, NEVER creates new ones
 * NEVER modifies _id field
 * Only updates: fullname, fullName, designation, department, avatarUrl, email
 */
async function safeFixUserData() {
  console.log('🔒 SAFE MODE: Only updating existing users\n');
  console.log('⚠️  WARNING: This will NOT create new users, only update existing ones\n');
  console.log('='.repeat(70) + '\n');

  let totalUpdated = 0;
  let totalSkipped = 0;

  // Step 1: Fix fullname = null from fullName
  console.log('Step 1️⃣  Fixing users with fullname = null from fullName\n');
  try {
    const users = await User.find({ $or: [{ fullname: null }, { fullname: '' }] });
    
    for (const user of users) {
      if (user.fullName && user.fullName.trim()) {
        user.fullname = user.fullName;
        await user.save();
        console.log(`   ✅ Updated: ${user._id}`);
        console.log(`      fullname: null → "${user.fullName}"`);
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  console.log(`\n   Result: Updated ${totalUpdated} users\n`);

  // Step 2: Scan devices and update EXISTING users with missing data
  console.log('='.repeat(70));
  console.log('\nStep 2️⃣  Scanning devices for user data to update existing users\n');

  const usersToUpdate = new Map(); // {userId: {email, fullname, designation, department, avatarUrl}}

  // Collect user data from devices
  for (const Model of models) {
    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        // From assigned
        if (doc.assigned && Array.isArray(doc.assigned)) {
          for (const assignedData of doc.assigned) {
            if (assignedData && assignedData._id) {
              const userId = assignedData._id.toString();
              if (!usersToUpdate.has(userId)) {
                usersToUpdate.set(userId, {
                  fullname: assignedData.fullname,
                  email: assignedData.email,
                  jobTitle: assignedData.jobTitle,
                  department: assignedData.department,
                  avatarUrl: assignedData.avatarUrl,
                });
              }
            }
          }
        }

        // From assignmentHistory
        if (doc.assignmentHistory && Array.isArray(doc.assignmentHistory)) {
          for (const history of doc.assignmentHistory) {
            if (history.user && history.user._id) {
              const userId = history.user._id.toString();
              if (!usersToUpdate.has(userId)) {
                usersToUpdate.set(userId, {
                  fullname: history.user.fullname || history.userName,
                  email: history.user.email,
                  jobTitle: history.user.jobTitle || history.jobTitle,
                  department: history.user.department,
                  avatarUrl: history.user.avatarUrl,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error scanning ${Model.modelName}: ${error.message}`);
    }
  }

  console.log(`   Found ${usersToUpdate.size} unique users in devices\n`);

  // Update only EXISTING users
  let existingUsersUpdated = 0;
  let missingUserIds = [];

  for (const [userId, userData] of usersToUpdate) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        console.log(`   ⚠️  User NOT FOUND in MongoDB (cannot update): ${userId}`);
        missingUserIds.push(userId);
        continue;
      }

      // SAFE: Only update fields, never change _id
      let changed = false;

      if (userData.fullname && !user.fullname) {
        user.fullname = userData.fullname;
        console.log(`   ✅ Updated ${userId}: fullname = "${userData.fullname}"`);
        changed = true;
      }

      if (userData.email && !user.email) {
        user.email = userData.email;
        console.log(`   ✅ Updated ${userId}: email = "${userData.email}"`);
        changed = true;
      }

      if (userData.jobTitle && !user.designation) {
        user.designation = userData.jobTitle;
        console.log(`   ✅ Updated ${userId}: designation = "${userData.jobTitle}"`);
        changed = true;
      }

      if (userData.department && !user.department) {
        user.department = userData.department;
        console.log(`   ✅ Updated ${userId}: department = "${userData.department}"`);
        changed = true;
      }

      if (userData.avatarUrl && !user.avatarUrl) {
        user.avatarUrl = userData.avatarUrl;
        console.log(`   ✅ Updated ${userId}: avatarUrl = "${userData.avatarUrl}"`);
        changed = true;
      }

      if (changed) {
        await user.save();
        existingUsersUpdated++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing user ${userId}: ${error.message}`);
    }
  }

  console.log(`\n   Result: Updated ${existingUsersUpdated} existing users`);

  // Step 3: Fix assignment history fullname
  console.log('\n' + '='.repeat(70));
  console.log('\nStep 3️⃣  Fixing assignment history fullname\n');

  let fixedHistoryCount = 0;

  for (const Model of models) {
    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        if (!doc.assignmentHistory || doc.assignmentHistory.length === 0) {
          continue;
        }

        let docChanged = false;

        for (let i = 0; i < doc.assignmentHistory.length; i++) {
          const history = doc.assignmentHistory[i];

          if (
            history.user &&
            (!history.fullname || history.fullname === null || history.fullname === undefined)
          ) {
            try {
              const user = await User.findById(history.user);

              if (user && user.fullname) {
                doc.assignmentHistory[i].fullname = user.fullname;
                docChanged = true;
                fixedHistoryCount++;
              } else if (history.userName) {
                // Fallback to userName from history
                doc.assignmentHistory[i].fullname = history.userName;
                docChanged = true;
                fixedHistoryCount++;
              }
            } catch (error) {
              console.error(`   ❌ Error: ${error.message}`);
            }
          }
        }

        if (docChanged) {
          try {
            await doc.save();
          } catch (error) {
            console.error(`   ❌ Error saving ${Model.modelName}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${Model.modelName}: ${error.message}`);
    }
  }

  console.log(`   Result: Fixed ${fixedHistoryCount} assignment history entries\n`);

  // Final Summary
  console.log('='.repeat(70));
  console.log('\n📊 FINAL SUMMARY:\n');
  console.log(`   ✅ Step 1 - Fixed fullname from fullName: ${totalUpdated} users`);
  console.log(`   ✅ Step 2 - Updated existing users: ${existingUsersUpdated} users`);
  if (missingUserIds.length > 0) {
    console.log(`   ⚠️  Missing users (NOT updated): ${missingUserIds.length}`);
    console.log(`       IDs: ${missingUserIds.slice(0, 5).join(', ')}${missingUserIds.length > 5 ? '...' : ''}`);
  }
  console.log(`   ✅ Step 3 - Fixed assignment history: ${fixedHistoryCount} entries`);
  console.log('\n✅ Safe fix completed!\n');

  return {
    step1: totalUpdated,
    step2: existingUsersUpdated,
    step3: fixedHistoryCount,
    missingUsers: missingUserIds,
  };
}

async function main() {
  try {
    await connectDB();

    console.log('🔒 SAFE USER DATA FIX (NO ID CHANGES)\n');
    console.log('⚠️  IMPORTANT NOTES:\n');
    console.log('   - Only updates EXISTING users in MongoDB');
    console.log('   - NEVER creates new users');
    console.log('   - NEVER modifies _id field');
    console.log('   - Only updates: fullname, email, designation, department, avatarUrl');
    console.log('   - Preserves all original IDs from legacy system\n');

    const result = await safeFixUserData();

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');

    if (result.missingUsers.length > 0) {
      console.log('⚠️  NOTE: Some user IDs from devices don\'t exist in MongoDB.');
      console.log('   These are likely missing from the migration. Manual review needed.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

