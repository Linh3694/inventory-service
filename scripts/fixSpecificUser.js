const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const User = require('../models/User');
const Monitor = require('../models/Monitor');
const Laptop = require('../models/Laptop');
const Phone = require('../models/Phone');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Tool = require('../models/Tool');
const Activity = require('../models/Activity');

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
 * Fix specific user's fullname
 * User: Linh Nguyễn Hải
 * Email: linh.nguyenhai@wellspring.edu.vn
 * ID: 6759d48300ed146910c108cd
 */
async function fixSpecificUser(userId = '6759d48300ed146910c108cd', targetFullname = 'Linh Nguyễn Hải') {
  console.log('🔧 Fixing specific user...\n');
  console.log(`   User ID: ${userId}`);
  console.log(`   Target fullname: ${targetFullname}\n`);
  console.log('='.repeat(70) + '\n');

  // Step 1: Fix User document
  console.log('Step 1️⃣  Updating User collection\n');
  try {
    const user = await User.findById(userId);

    if (!user) {
      console.log(`   ❌ User not found: ${userId}`);
      return false;
    }

    console.log(`   Found user: ${user.email}`);
    console.log(`   Current fullname: ${user.fullname}`);
    console.log(`   Current fullName: ${user.fullName}`);

    if (!user.fullname || user.fullname === null) {
      user.fullname = targetFullname;
      user.fullName = targetFullname;
      await user.save();
      console.log(`   ✅ Updated user fullname to: "${targetFullname}"\n`);
    } else {
      console.log(`   ℹ️  User already has fullname: "${user.fullname}"\n`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    return false;
  }

  // Step 2: Fix assignment history
  console.log('Step 2️⃣  Updating assignment history in all devices\n');

  let updatedCount = 0;

  for (const Model of models) {
    try {
      const documents = await Model.find({
        'assignmentHistory.user': new mongoose.Types.ObjectId(userId),
      });

      for (const doc of documents) {
        let docChanged = false;

        for (let i = 0; i < doc.assignmentHistory.length; i++) {
          const history = doc.assignmentHistory[i];

          if (
            history.user &&
            history.user.toString() === userId &&
            (!history.fullname || history.fullname === null || history.fullname === undefined)
          ) {
            doc.assignmentHistory[i].fullname = targetFullname;
            docChanged = true;
            updatedCount++;
            console.log(
              `   ✅ Fixed: ${Model.modelName} (${doc._id}) - History ${history._id}`
            );
          }
        }

        if (docChanged) {
          await doc.save();
        }
      }
    } catch (error) {
      console.error(`   ❌ Error in ${Model.modelName}: ${error.message}`);
    }
  }

  console.log(`\n   Total assignment history entries fixed: ${updatedCount}\n`);

  // Step 3: Fix assigned field if needed
  console.log('Step 3️⃣  Updating assigned field in devices\n');

  let assignedUpdatedCount = 0;

  for (const Model of models) {
    try {
      const documents = await Model.find({
        'assigned._id': new mongoose.Types.ObjectId(userId),
      });

      for (const doc of documents) {
        let docChanged = false;

        for (let i = 0; i < doc.assigned.length; i++) {
          if (doc.assigned[i]._id.toString() === userId) {
            if (!doc.assigned[i].fullname || doc.assigned[i].fullname === null) {
              doc.assigned[i].fullname = targetFullname;
              docChanged = true;
              assignedUpdatedCount++;
              console.log(
                `   ✅ Fixed: ${Model.modelName} (${doc._id}) - assigned field`
              );
            }
          }
        }

        if (docChanged) {
          await doc.save();
        }
      }
    } catch (error) {
      console.error(`   ❌ Error in ${Model.modelName}: ${error.message}`);
    }
  }

  console.log(`\n   Total assigned field entries fixed: ${assignedUpdatedCount}\n`);

  return true;
}

async function main() {
  try {
    await connectDB();

    console.log('🔧 MANUAL FIX FOR SPECIFIC USER\n');
    console.log('User: Linh Nguyễn Hải');
    console.log('Email: linh.nguyenhai@wellspring.edu.vn');
    console.log('ID: 6759d48300ed146910c108cd\n');
    console.log('='.repeat(70) + '\n');

    const success = await fixSpecificUser();

    if (success) {
      console.log('='.repeat(70));
      console.log('\n✅ Successfully fixed user!\n');
    } else {
      console.log('\n❌ Fix failed!\n');
    }

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

