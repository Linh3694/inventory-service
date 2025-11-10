const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

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
 * Fix Linh Nguyễn Hải directly using mongoose updateMany
 */
async function fixLinhNguyenHai() {
  console.log('🔧 Fixing Linh Nguyễn Hải\n');
  console.log('='.repeat(70) + '\n');

  const userId = '6759d48300ed146910c108cd';
  const fullname = 'Linh Nguyễn Hải';

  // Get models directly from mongoose connection
  const db = mongoose.connection;

  // Step 1: Fix User collection
  console.log('Step 1️⃣  Fixing User collection\n');
  try {
    const result = await db.collection('users').updateOne(
      { _id: mongoose.Types.ObjectId(userId) },
      {
        $set: {
          fullname: fullname,
          fullName: fullname,
          updatedAt: new Date(),
        },
      }
    );
    console.log(`   ✅ Updated user: ${result.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 2: Fix Monitor assigned field
  console.log('\nStep 2️⃣  Fixing Monitor assigned field\n');
  try {
    const result = await db.collection('monitors').updateMany(
      { 'assigned._id': mongoose.Types.ObjectId(userId), 'assigned.fullname': null },
      {
        $set: {
          'assigned.$[elem].fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem._id': mongoose.Types.ObjectId(userId) }] }
    );
    console.log(`   ✅ Updated monitors: ${result.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 3: Fix Monitor assignmentHistory.user.fullname
  console.log('\nStep 3️⃣  Fixing Monitor assignmentHistory.user.fullname\n');
  try {
    const result = await db.collection('monitors').updateMany(
      { 'assignmentHistory.user._id': mongoose.Types.ObjectId(userId), 'assignmentHistory.user.fullname': null },
      {
        $set: {
          'assignmentHistory.$[elem].user.fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem.user._id': mongoose.Types.ObjectId(userId) }] }
    );
    console.log(`   ✅ Updated monitors: ${result.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 4: Fix Monitor assignmentHistory.fullname
  console.log('\nStep 4️⃣  Fixing Monitor assignmentHistory.fullname\n');
  try {
    const result = await db.collection('monitors').updateMany(
      { 'assignmentHistory.user': mongoose.Types.ObjectId(userId), 'assignmentHistory.fullname': null },
      {
        $set: {
          'assignmentHistory.$[elem].fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem.user': mongoose.Types.ObjectId(userId) }] }
    );
    console.log(`   ✅ Updated monitors: ${result.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 5: Fix Laptop
  console.log('\nStep 5️⃣  Fixing Laptop assigned & assignmentHistory fields\n');
  try {
    const result1 = await db.collection('laptops').updateMany(
      { 'assigned._id': mongoose.Types.ObjectId(userId), 'assigned.fullname': null },
      {
        $set: {
          'assigned.$[elem].fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem._id': mongoose.Types.ObjectId(userId) }] }
    );

    const result2 = await db.collection('laptops').updateMany(
      { 'assignmentHistory.user._id': mongoose.Types.ObjectId(userId), 'assignmentHistory.user.fullname': null },
      {
        $set: {
          'assignmentHistory.$[elem].user.fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem.user._id': mongoose.Types.ObjectId(userId) }] }
    );

    const result3 = await db.collection('laptops').updateMany(
      { 'assignmentHistory.user': mongoose.Types.ObjectId(userId), 'assignmentHistory.fullname': null },
      {
        $set: {
          'assignmentHistory.$[elem].fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem.user': mongoose.Types.ObjectId(userId) }] }
    );

    console.log(`   ✅ Updated laptops (assigned): ${result1.modifiedCount}`);
    console.log(`   ✅ Updated laptops (history.user): ${result2.modifiedCount}`);
    console.log(`   ✅ Updated laptops (history.fullname): ${result3.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 6: Fix Phone
  console.log('\nStep 6️⃣  Fixing Phone\n');
  try {
    const result1 = await db.collection('phones').updateMany(
      { 'assigned._id': mongoose.Types.ObjectId(userId), 'assigned.fullname': null },
      {
        $set: {
          'assigned.$[elem].fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem._id': mongoose.Types.ObjectId(userId) }] }
    );

    const result2 = await db.collection('phones').updateMany(
      { 'assignmentHistory.user._id': mongoose.Types.ObjectId(userId), 'assignmentHistory.user.fullname': null },
      {
        $set: {
          'assignmentHistory.$[elem].user.fullname': fullname,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'elem.user._id': mongoose.Types.ObjectId(userId) }] }
    );

    console.log(`   ✅ Updated phones (assigned): ${result1.modifiedCount}`);
    console.log(`   ✅ Updated phones (history.user): ${result2.modifiedCount}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }

  // Step 7: Fix Printer, Projector, Tool
  console.log('\nStep 7️⃣  Fixing Printer/Projector/Tool\n');
  const collections = ['printers', 'projectors', 'tools'];
  
  for (const collName of collections) {
    try {
      const result1 = await db.collection(collName).updateMany(
        { 'assigned._id': mongoose.Types.ObjectId(userId), 'assigned.fullname': null },
        {
          $set: {
            'assigned.$[elem].fullname': fullname,
            updatedAt: new Date(),
          },
        },
        { arrayFilters: [{ 'elem._id': mongoose.Types.ObjectId(userId) }] }
      );

      const result2 = await db.collection(collName).updateMany(
        { 'assignmentHistory.user._id': mongoose.Types.ObjectId(userId), 'assignmentHistory.user.fullname': null },
        {
          $set: {
            'assignmentHistory.$[elem].user.fullname': fullname,
            updatedAt: new Date(),
          },
        },
        { arrayFilters: [{ 'elem.user._id': mongoose.Types.ObjectId(userId) }] }
      );

      console.log(`   ✅ Updated ${collName}: ${result1.modifiedCount + result2.modifiedCount}`);
    } catch (error) {
      console.error(`   ❌ Error in ${collName}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n✅ Fix completed!\n');
}

async function main() {
  try {
    await connectDB();
    await fixLinhNguyenHai();
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

