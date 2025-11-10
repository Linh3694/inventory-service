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

async function verifyUserIssues() {
  console.log('🔍 Verifying user data issues...\n');
  console.log('='.repeat(70));

  // Issue 1: Users with fullname = null but fullName exists
  console.log('\n📋 Issue 1: Users with fullname = null but fullName exists\n');
  try {
    const users = await User.find({ 
      fullname: null,
      fullName: { $ne: null, $ne: '' }
    });

    if (users.length > 0) {
      console.log(`   Found ${users.length} users:\n`);
      for (const user of users) {
        console.log(`   ❌ ID: ${user._id}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      fullname: ${user.fullname}`);
        console.log(`      fullName: ${user.fullName}`);
        console.log(`      designation: ${user.designation}`);
        console.log(`      department: ${user.department}\n`);
      }
    } else {
      console.log('   ✅ No users with this issue found\n');
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  // Issue 2: Extract all user refs from devices and check if they exist
  console.log('='.repeat(70));
  console.log('\n📋 Issue 2: User references in devices that don\'t exist in User collection\n');

  const userRefsFromDevices = new Map(); // {userId: count}
  const userDetails = new Map(); // {userId: {email, fullname, etc}}

  for (const Model of models) {
    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        // From assigned
        if (doc.assigned && Array.isArray(doc.assigned)) {
          for (const assignedData of doc.assigned) {
            if (assignedData && assignedData._id) {
              const userId = assignedData._id.toString();
              userRefsFromDevices.set(userId, (userRefsFromDevices.get(userId) || 0) + 1);
              if (!userDetails.has(userId)) {
                userDetails.set(userId, {
                  fullname: assignedData.fullname,
                  email: assignedData.email,
                  jobTitle: assignedData.jobTitle,
                  avatarUrl: assignedData.avatarUrl,
                  department: assignedData.department,
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
              userRefsFromDevices.set(userId, (userRefsFromDevices.get(userId) || 0) + 1);
              if (!userDetails.has(userId)) {
                userDetails.set(userId, {
                  fullname: history.user.fullname || history.userName,
                  email: history.user.email,
                  jobTitle: history.user.jobTitle || history.jobTitle,
                  avatarUrl: history.user.avatarUrl,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${Model.modelName}: ${error.message}`);
    }
  }

  console.log(`   Total unique users referenced in devices: ${userRefsFromDevices.size}\n`);

  // Check which ones don't exist in User collection
  const missingUsers = [];
  for (const [userId, count] of userRefsFromDevices) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        missingUsers.push({
          userId,
          count,
          details: userDetails.get(userId),
        });
      }
    } catch (error) {
      console.error(`   ❌ Error checking user ${userId}: ${error.message}`);
    }
  }

  if (missingUsers.length > 0) {
    console.log(`   ⚠️  Found ${missingUsers.length} user references that don't exist:\n`);
    for (const missing of missingUsers) {
      console.log(`   ❌ ID: ${missing.userId} (referenced ${missing.count} times)`);
      const details = missing.details;
      if (details) {
        console.log(`      fullname: ${details.fullname}`);
        console.log(`      email: ${details.email}`);
        console.log(`      jobTitle: ${details.jobTitle}`);
        console.log(`      department: ${details.department}\n`);
      }
    }
  } else {
    console.log('   ✅ All user references exist in User collection\n');
  }

  // Issue 3: Assignment history with null fullname
  console.log('='.repeat(70));
  console.log('\n📋 Issue 3: Assignment history entries with null fullname\n');

  let nullFullnameCount = 0;
  for (const Model of models) {
    try {
      const documents = await Model.find({
        'assignmentHistory.fullname': null,
      });

      for (const doc of documents) {
        for (const history of doc.assignmentHistory) {
          if (!history.fullname || history.fullname === null) {
            nullFullnameCount++;
          }
        }
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  if (nullFullnameCount > 0) {
    console.log(`   ⚠️  Found ${nullFullnameCount} assignment history entries with null fullname\n`);
  } else {
    console.log('   ✅ No assignment history entries with null fullname\n');
  }

  console.log('='.repeat(70));
}

async function main() {
  try {
    await connectDB();
    await verifyUserIssues();
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

