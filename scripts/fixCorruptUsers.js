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

async function fixCorruptUsers() {
  console.log('🔧 Fixing corrupt users (fullname = null)\n');
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Find users with fullname = null but fullName exists
    console.log('Step 1️⃣  Fix users: fullname = null → fullName\n');
    
    const usersWithFullNameButNoFullname = await User.find({
      $or: [
        { fullname: null },
        { fullname: '' },
        { fullname: { $exists: false } }
      ],
      fullName: { $ne: null, $ne: '' }
    });

    let fixed1 = 0;
    for (const user of usersWithFullNameButNoFullname) {
      user.fullname = user.fullName;
      await user.save();
      console.log(`✅ Fixed: ${user._id}`);
      console.log(`   ${user.email} → "${user.fullname}"\n`);
      fixed1++;
    }
    console.log(`   Result: ${fixed1} users fixed\n`);

    // Step 2: Find completely corrupt users (all fields undefined/null)
    console.log('Step 2️⃣  Finding completely corrupt users\n');
    
    const corruptUsers = await User.find({
      $and: [
        { $or: [{ email: null }, { email: { $exists: false } }] },
        { $or: [{ fullname: null }, { fullname: { $exists: false } }] },
        { $or: [{ fullName: null }, { fullName: { $exists: false } }] },
      ]
    });

    if (corruptUsers.length > 0) {
      console.log(`⚠️  Found ${corruptUsers.length} completely corrupt users:\n`);
      for (const user of corruptUsers) {
        console.log(`ID: ${user._id}`);
        console.log(`   email: ${user.email}`);
        console.log(`   fullname: ${user.fullname}`);
        console.log(`   fullName: ${user.fullName}`);
        console.log(`   frappeUserId: ${user.frappeUserId}\n`);
      }

      console.log('⚠️  These users should be investigated/deleted');
      console.log('   They might be orphaned or migration errors\n');
    } else {
      console.log('✅ No completely corrupt users found\n');
    }

    // Step 3: Verify fix
    console.log('Step 3️⃣  Verification\n');
    
    const stillNullFullname = await User.find({
      $or: [
        { fullname: null },
        { fullname: '' },
        { fullname: { $exists: false } }
      ]
    });

    console.log(`Users with null fullname after fix: ${stillNullFullname.length}`);
    
    if (stillNullFullname.length > 0) {
      console.log('\n⚠️  Remaining users with null fullname:\n');
      for (const user of stillNullFullname) {
        console.log(`ID: ${user._id} - Email: ${user.email} - fullName: ${user.fullName}`);
      }
    } else {
      console.log('✅ All users now have fullname!\n');
    }

    return { fixed: fixed1, corrupt: corruptUsers.length };

  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function main() {
  try {
    await connectDB();

    console.log('🔧 FIX CORRUPT USERS - ROOT CAUSE SOLUTION\n');
    console.log('Root Cause:');
    console.log('  - Device documents KHÔNG lưu fullname (chỉ lưu user._id)');
    console.log('  - fullname được populate từ User collection');
    console.log('  - Nếu User.fullname = null → API trả về null');
    console.log('  - Solution: Fix User documents!\n');
    console.log('='.repeat(70) + '\n');

    const result = await fixCorruptUsers();

    console.log('='.repeat(70));
    console.log('\n📊 SUMMARY:\n');
    if (result) {
      console.log(`✅ Users fixed: ${result.fixed}`);
      console.log(`⚠️  Corrupt users found: ${result.corrupt}`);
      console.log(`\n💡 After this fix, API will return correct fullname`);
      console.log('   (No device changes needed - auto-inherit from User via populate)\n');
    }

    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

