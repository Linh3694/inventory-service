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

async function findMissingUsers() {
  const missingUserIds = new Set();
  const usersWithoutFullname = new Set();

  console.log('🔍 Scanning all devices for missing or incomplete users...\n');

  for (const Model of models) {
    console.log(`📦 ${Model.modelName}:`);

    try {
      const documents = await Model.find({});

      for (const doc of documents) {
        if (!doc.assignmentHistory || doc.assignmentHistory.length === 0) {
          continue;
        }

        for (const history of doc.assignmentHistory) {
          if (history.user) {
            const user = await User.findById(history.user);

            if (!user) {
              missingUserIds.add(history.user.toString());
              console.log(`   ⚠️  User not found: ${history.user}`);
            } else if (!user.fullname || user.fullname === null || user.fullname === undefined) {
              usersWithoutFullname.add({
                id: user._id.toString(),
                email: user.email,
                fullname: user.fullname,
                fullName: user.fullName,
              });
              console.log(
                `   ⚠️  No fullname: ${user._id} (email: ${user.email}, fullname: ${user.fullname}, fullName: ${user.fullName})`
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${Model.modelName}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary:');
  console.log('='.repeat(70));

  if (missingUserIds.size > 0) {
    console.log(`\n❌ Missing Users (${missingUserIds.size}):`);
    console.log(JSON.stringify(Array.from(missingUserIds), null, 2));
  }

  if (usersWithoutFullname.size > 0) {
    console.log(`\n⚠️  Users without fullname (${usersWithoutFullname.size}):`);
    const usersList = Array.from(usersWithoutFullname);
    console.log(JSON.stringify(usersList, null, 2));

    // Create SQL/update commands for these users
    console.log('\n📝 MongoDB update commands for users without fullname:');
    for (const user of usersList) {
      console.log(`\ndb.users.updateOne(
  { _id: ObjectId("${user.id}") },
  { $set: { fullname: "YOUR_FULLNAME_HERE", updatedAt: new Date() } }
);`);
    }
  }

  console.log('\n' + '='.repeat(70));

  return { missingUserIds: Array.from(missingUserIds), usersWithoutFullname: Array.from(usersWithoutFullname) };
}

async function main() {
  try {
    await connectDB();
    const result = await findMissingUsers();

    console.log('\n💡 Next steps:');
    console.log('1. Update users without fullname in MongoDB or sync from Frappe');
    console.log('2. Run: node scripts/syncUsersFromFrappe.js [USER_ID]');
    console.log('3. Then re-run: node scripts/fixNullFullnameInHistory.js');

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

