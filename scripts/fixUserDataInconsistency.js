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

// Step 1: Fix users có fullname = null từ fullName
async function fixNullFullnameFromFullName() {
  console.log('Step 1️⃣  Fixing users with fullname = null from fullName...\n');
  let fixed = 0;

  try {
    const users = await User.find({ $or: [{ fullname: null }, { fullname: '' }] });
    console.log(`   Found ${users.length} users with fullname = null\n`);

    for (const user of users) {
      if (user.fullName && user.fullName.trim()) {
        user.fullname = user.fullName;
        await user.save();
        console.log(`   ✅ Fixed: ${user._id} -> ${user.fullname}`);
        fixed++;
      } else {
        console.log(`   ⚠️  No fullName to copy from: ${user._id}`);
      }
    }
  } catch (error) {
    console.error(`   ❌ Error in Step 1:`, error.message);
  }

  console.log(`\n   ✅ Step 1 completed: Fixed ${fixed} users\n`);
  return fixed;
}

// Step 2: Extract all user data từ devices và create/update missing users
async function extractAndCreateMissingUsers() {
  console.log('Step 2️⃣  Extracting user data from devices and creating missing users...\n');

  const userMap = new Map(); // {userId: {email, fullname, department, etc}}
  let extracted = 0;
  let created = 0;
  let updated = 0;

  // Extract from all models
  for (const Model of models) {
    console.log(`   Processing ${Model.modelName}...`);

    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        // Check assigned users
        if (doc.assigned && Array.isArray(doc.assigned)) {
          for (const assignedData of doc.assigned) {
            if (assignedData && assignedData._id) {
              const userId = assignedData._id.toString();
              if (!userMap.has(userId)) {
                userMap.set(userId, {
                  _id: userId,
                  fullname: assignedData.fullname,
                  department: assignedData.department,
                  jobTitle: assignedData.jobTitle,
                  avatarUrl: assignedData.avatarUrl,
                });
                extracted++;
              }
            }
          }
        }

        // Check assignment history
        if (doc.assignmentHistory && Array.isArray(doc.assignmentHistory)) {
          for (const history of doc.assignmentHistory) {
            if (history.user && history.user._id) {
              const userId = history.user._id.toString();
              if (!userMap.has(userId)) {
                userMap.set(userId, {
                  _id: userId,
                  fullname: history.user.fullname || history.userName,
                  email: history.user.email,
                  jobTitle: history.user.jobTitle,
                  avatarUrl: history.user.avatarUrl,
                });
                extracted++;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${Model.modelName}:`, error.message);
    }
  }

  console.log(`\n   Extracted ${extracted} unique user IDs from devices\n`);
  console.log('   Creating/Updating users in database...\n');

  // Create or update users
  for (const [userId, userData] of userMap) {
    try {
      const existingUser = await User.findById(userId);

      if (existingUser) {
        // Update existing user
        let updated_flag = false;
        if (userData.fullname && !existingUser.fullname) {
          existingUser.fullname = userData.fullname;
          updated_flag = true;
        }
        if (userData.email && !existingUser.email) {
          existingUser.email = userData.email;
          updated_flag = true;
        }
        if (userData.jobTitle && !existingUser.designation) {
          existingUser.designation = userData.jobTitle;
          updated_flag = true;
        }
        if (userData.department && !existingUser.department) {
          existingUser.department = userData.department;
          updated_flag = true;
        }
        if (userData.avatarUrl && !existingUser.avatarUrl) {
          existingUser.avatarUrl = userData.avatarUrl;
          updated_flag = true;
        }

        if (updated_flag) {
          await existingUser.save();
          console.log(`   📝 Updated: ${userId}`);
          updated++;
        }
      } else {
        // Create new user
        const newUser = new User({
          _id: userId,
          fullname: userData.fullname,
          fullName: userData.fullname,
          email: userData.email,
          jobTitle: userData.jobTitle,
          designation: userData.jobTitle,
          department: userData.department,
          avatarUrl: userData.avatarUrl,
          frappeUserId: userData.email, // Use email as fallback
        });

        await newUser.save();
        console.log(`   ✨ Created: ${userId} -> ${userData.fullname}`);
        created++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing user ${userId}:`, error.message);
    }
  }

  console.log(`\n   ✅ Step 2 completed: Created ${created} users, Updated ${updated} users\n`);
  return { created, updated, extracted };
}

// Step 3: Verify and fix assignment history again
async function fixAssignmentHistoryFullname() {
  console.log('Step 3️⃣  Fixing assignment history fullname...\n');
  let fixed = 0;

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
                fixed++;
              } else if (history.userName) {
                // Fallback to userName
                doc.assignmentHistory[i].fullname = history.userName;
                docChanged = true;
                fixed++;
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
            console.error(`   ❌ Error saving ${Model.modelName} (${doc._id}):`, error.message);
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${Model.modelName}:`, error.message);
    }
  }

  console.log(`\n   ✅ Step 3 completed: Fixed ${fixed} assignment history entries\n`);
  return fixed;
}

async function main() {
  try {
    await connectDB();

    console.log('🚀 Starting comprehensive user data inconsistency fix...\n');
    console.log('='.repeat(70));

    const step1Result = await fixNullFullnameFromFullName();
    const step2Result = await extractAndCreateMissingUsers();
    const step3Result = await fixAssignmentHistoryFullname();

    console.log('='.repeat(70));
    console.log('\n📊 FINAL SUMMARY:\n');
    console.log(`   Step 1 - Fixed fullname from fullName: ${step1Result}`);
    console.log(`   Step 2 - Created new users: ${step2Result.created}`);
    console.log(`   Step 2 - Updated existing users: ${step2Result.updated}`);
    console.log(`   Step 2 - Extracted unique users: ${step2Result.extracted}`);
    console.log(`   Step 3 - Fixed assignment history: ${step3Result}`);
    console.log('\n✅ Comprehensive fix completed successfully!');

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

