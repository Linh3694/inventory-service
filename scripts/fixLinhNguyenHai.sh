#!/bin/bash

# Fix Linh Nguyễn Hải - fullname = null
# User ID: 6759d48300ed146910c108cd
# Email: linh.nguyenhai@wellspring.edu.vn

echo "🔧 Fixing Linh Nguyễn Hải"
echo "=================================="
echo ""

mongosh inventory_service << 'EOF'

const userId = ObjectId("6759d48300ed146910c108cd");
const fullname = "Linh Nguyễn Hải";

console.log("📝 FIXING LINH NGUYỄN HẢI");
console.log("=".repeat(70));

// Step 1: Fix User collection
console.log("\nStep 1️⃣  Fixing User collection");
const userResult = db.users.updateOne(
  { _id: userId },
  {
    $set: {
      fullname: fullname,
      fullName: fullname,
      updatedAt: new Date()
    }
  }
);
console.log(`✅ Modified: ${userResult.modifiedCount}`);

// Step 2: Fix Monitor
console.log("\nStep 2️⃣  Fixing Monitor (assigned field)");
const monitorAssigned = db.monitors.updateMany(
  { 'assigned._id': userId, 'assigned.fullname': null },
  {
    $set: {
      'assigned.$[elem].fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem._id': userId }] }
);
console.log(`✅ Modified: ${monitorAssigned.modifiedCount}`);

console.log("\nStep 2b️⃣  Fixing Monitor (assignmentHistory.user.fullname)");
const monitorHistoryUser = db.monitors.updateMany(
  { 'assignmentHistory.user._id': userId, 'assignmentHistory.user.fullname': null },
  {
    $set: {
      'assignmentHistory.$[elem].user.fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem.user._id': userId }] }
);
console.log(`✅ Modified: ${monitorHistoryUser.modifiedCount}`);

console.log("\nStep 2c️⃣  Fixing Monitor (assignmentHistory.fullname)");
const monitorHistoryFullname = db.monitors.updateMany(
  { 'assignmentHistory.user': userId, 'assignmentHistory.fullname': null },
  {
    $set: {
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem.user': userId }] }
);
console.log(`✅ Modified: ${monitorHistoryFullname.modifiedCount}`);

// Step 3: Fix Laptop
console.log("\nStep 3️⃣  Fixing Laptop");
const laptopAssigned = db.laptops.updateMany(
  { 'assigned._id': userId, 'assigned.fullname': null },
  {
    $set: {
      'assigned.$[elem].fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem._id': userId }] }
);

const laptopHistoryUser = db.laptops.updateMany(
  { 'assignmentHistory.user._id': userId, 'assignmentHistory.user.fullname': null },
  {
    $set: {
      'assignmentHistory.$[elem].user.fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem.user._id': userId }] }
);

const laptopHistoryFullname = db.laptops.updateMany(
  { 'assignmentHistory.user': userId, 'assignmentHistory.fullname': null },
  {
    $set: {
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    }
  },
  { arrayFilters: [{ 'elem.user': userId }] }
);

console.log(`✅ Modified (total): ${laptopAssigned.modifiedCount + laptopHistoryUser.modifiedCount + laptopHistoryFullname.modifiedCount}`);

// Step 4: Fix Phone, Printer, Projector, Tool
console.log("\nStep 4️⃣  Fixing Phone/Printer/Projector/Tool");

const collections = ['phones', 'printers', 'projectors', 'tools'];
let totalModified = 0;

for (const collName of collections) {
  const assigned = db[collName].updateMany(
    { 'assigned._id': userId, 'assigned.fullname': null },
    {
      $set: {
        'assigned.$[elem].fullname': fullname,
        updatedAt: new Date()
      }
    },
    { arrayFilters: [{ 'elem._id': userId }] }
  );

  const historyUser = db[collName].updateMany(
    { 'assignmentHistory.user._id': userId, 'assignmentHistory.user.fullname': null },
    {
      $set: {
        'assignmentHistory.$[elem].user.fullname': fullname,
        updatedAt: new Date()
      }
    },
    { arrayFilters: [{ 'elem.user._id': userId }] }
  );

  const historyFullname = db[collName].updateMany(
    { 'assignmentHistory.user': userId, 'assignmentHistory.fullname': null },
    {
      $set: {
        'assignmentHistory.$[elem].fullname': fullname,
        updatedAt: new Date()
      }
    },
    { arrayFilters: [{ 'elem.user': userId }] }
  );

  const count = assigned.modifiedCount + historyUser.modifiedCount + historyFullname.modifiedCount;
  if (count > 0) {
    console.log(`✅ ${collName}: ${count}`);
    totalModified += count;
  }
}

// Summary
console.log("\n" + "=".repeat(70));
console.log("\n📊 SUMMARY");
console.log("=".repeat(70));
console.log(`✅ User: 1`);
console.log(`✅ Monitor: ${monitorAssigned.modifiedCount + monitorHistoryUser.modifiedCount + monitorHistoryFullname.modifiedCount}`);
console.log(`✅ Laptop: ${laptopAssigned.modifiedCount + laptopHistoryUser.modifiedCount + laptopHistoryFullname.modifiedCount}`);
console.log(`✅ Phone/Printer/Projector/Tool: ${totalModified}`);
console.log(`\n🎉 Total: ${1 + monitorAssigned.modifiedCount + monitorHistoryUser.modifiedCount + monitorHistoryFullname.modifiedCount + laptopAssigned.modifiedCount + laptopHistoryUser.modifiedCount + laptopHistoryFullname.modifiedCount + totalModified}`);

console.log("\n✅ Fix completed!\n");

EOF

