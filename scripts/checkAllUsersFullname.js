const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const User = require('../models/User');

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

async function checkAllUsers() {
  console.log('🔍 Checking all users for fullname = null\n');
  console.log('='.repeat(70) + '\n');

  try {
    // Find all users
    const allUsers = await User.find({});
    console.log(`Total users: ${allUsers.length}\n`);

    // Check for null fullname
    const usersWithNullFullname = allUsers.filter(u => !u.fullname || u.fullname === null || u.fullname === '');
    console.log(`Users with null/empty fullname: ${usersWithNullFullname.length}\n`);

    if (usersWithNullFullname.length > 0) {
      console.log('❌ Users with fullname = null:\n');
      for (const user of usersWithNullFullname) {
        console.log(`ID: ${user._id}`);
        console.log(`  email: ${user.email}`);
        console.log(`  fullname: ${user.fullname}`);
        console.log(`  fullName: ${user.fullName}`);
        console.log(`  name: ${user.name}`);
        console.log(`  frappeUserId: ${user.frappeUserId}`);
        console.log('');
      }
    } else {
      console.log('✅ All users have fullname!\n');
    }

    // Check for users with fullName but no fullname
    const usersWithFullNameButNoFullname = allUsers.filter(
      u => (!u.fullname || u.fullname === null || u.fullname === '') && (u.fullName && u.fullName !== '')
    );

    if (usersWithFullNameButNoFullname.length > 0) {
      console.log('='.repeat(70));
      console.log('\n⚠️  Users with fullName but NO fullname:\n');
      for (const user of usersWithFullNameButNoFullname) {
        console.log(`ID: ${user._id}`);
        console.log(`  email: ${user.email}`);
        console.log(`  fullname: ${user.fullname} (EMPTY)`);
        console.log(`  fullName: ${user.fullName} (HAS VALUE)`);
        console.log(`  Solution: fullname = "${user.fullName}"\n`);
      }

      // Auto fix
      console.log('\n📝 Auto-fixing these users...\n');
      let fixed = 0;
      for (const user of usersWithFullNameButNoFullname) {
        user.fullname = user.fullName;
        await user.save();
        console.log(`✅ Fixed: ${user._id} -> ${user.fullname}`);
        fixed++;
      }
      console.log(`\n✅ Total fixed: ${fixed}`);
    }

    // Analysis: Why fullname is null?
    console.log('\n' + '='.repeat(70));
    console.log('\n📊 ROOT CAUSE ANALYSIS:\n');

    console.log('✅ When you call .populate("assigned", "fullname jobTitle...")');
    console.log('   - MongoDB returns ONLY the selected fields');
    console.log('   - If source document has fullname = null, it stays null');
    console.log('   - This explains why assigned[].fullname = null in the API response\n');

    console.log('🔍 The issue is:');
    console.log('   1. User document has: fullname = null, fullName = "Linh Nguyễn Hải"');
    console.log('   2. Device populates: .populate("assigned", "fullname..."');
    console.log('   3. Result: assigned[].fullname = null (because User.fullname = null)\n');

    console.log('💡 Solution:');
    console.log('   1. Always ensure User.fullname matches User.fullName');
    console.log('   2. Fix User documents to have fullname populated');
    console.log('   3. No need to fix device documents - they inherit from User via populate\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function main() {
  try {
    await connectDB();
    await checkAllUsers();
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

