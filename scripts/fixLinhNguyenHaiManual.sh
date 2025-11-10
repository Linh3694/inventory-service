#!/bin/bash

# Manual fix for: Linh Nguyễn Hải
# Email: linh.nguyenhai@wellspring.edu.vn
# ID: 6759d48300ed146910c108cd

echo "🔧 Manual fix for Linh Nguyễn Hải"
echo "=================================="
echo ""
echo "Connecting to MongoDB..."
echo ""

# Connect to MongoDB and run commands
mongosh inventory_service << 'EOF'

// User ID
const userId = ObjectId("6759d48300ed146910c108cd");
const fullname = "Linh Nguyễn Hải";

console.log("📋 Current state:");
console.log("=".repeat(60));

// Check User collection
const user = db.users.findOne({ _id: userId });
console.log("\n✅ User document:");
if (user) {
  console.log(`   ID: ${user._id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   fullname: ${user.fullname}`);
  console.log(`   fullName: ${user.fullName}`);
} else {
  console.log("   User not found!");
}

// Step 1: Update User collection
console.log("\n\n📝 Step 1: Updating User collection");
console.log("=".repeat(60));

const updateResult = db.users.updateOne(
  { _id: userId },
  { 
    $set: { 
      fullname: fullname,
      fullName: fullname,
      updatedAt: new Date()
    } 
  }
);

console.log(`   Modified: ${updateResult.modifiedCount}`);
console.log(`   ✅ User fullname updated to: "${fullname}"`);

// Step 2: Update assignment history in monitors
console.log("\n\n📝 Step 2: Updating Monitor assignment history");
console.log("=".repeat(60));

const monitorResult = db.monitors.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

console.log(`   Matched: ${monitorResult.matchedCount}`);
console.log(`   Modified: ${monitorResult.modifiedCount}`);

// Step 3: Update assignment history in laptops
console.log("\n📝 Step 3: Updating Laptop assignment history");
console.log("=".repeat(60));

const laptopResult = db.laptops.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

console.log(`   Matched: ${laptopResult.matchedCount}`);
console.log(`   Modified: ${laptopResult.modifiedCount}`);

// Step 4: Update assignment history in other collections
console.log("\n📝 Step 4: Updating Phone/Printer/Projector/Tool assignment history");
console.log("=".repeat(60));

const phoneResult = db.phones.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

const printerResult = db.printers.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

const projectorResult = db.projectors.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

const toolResult = db.tools.updateMany(
  { 'assignmentHistory.user': userId },
  { 
    $set: { 
      'assignmentHistory.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem.user': userId, 'elem.fullname': null }] }
);

console.log(`   Phone - Modified: ${phoneResult.modifiedCount}`);
console.log(`   Printer - Modified: ${printerResult.modifiedCount}`);
console.log(`   Projector - Modified: ${projectorResult.modifiedCount}`);
console.log(`   Tool - Modified: ${toolResult.modifiedCount}`);

// Step 5: Update assigned field
console.log("\n📝 Step 5: Updating assigned field");
console.log("=".repeat(60));

const assignedMonitorResult = db.monitors.updateMany(
  { 'assigned._id': userId, 'assigned.fullname': null },
  { 
    $set: { 
      'assigned.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem._id': userId }] }
);

const assignedLaptopResult = db.laptops.updateMany(
  { 'assigned._id': userId, 'assigned.fullname': null },
  { 
    $set: { 
      'assigned.$[elem].fullname': fullname,
      updatedAt: new Date()
    } 
  },
  { arrayFilters: [{ 'elem._id': userId }] }
);

console.log(`   Monitor - Modified: ${assignedMonitorResult.modifiedCount}`);
console.log(`   Laptop - Modified: ${assignedLaptopResult.modifiedCount}`);

// Summary
console.log("\n\n📊 SUMMARY");
console.log("=".repeat(60));
console.log(`✅ User: 1 (updated)`);
console.log(`✅ Monitor history: ${monitorResult.modifiedCount}`);
console.log(`✅ Laptop history: ${laptopResult.modifiedCount}`);
console.log(`✅ Phone history: ${phoneResult.modifiedCount}`);
console.log(`✅ Printer history: ${printerResult.modifiedCount}`);
console.log(`✅ Projector history: ${projectorResult.modifiedCount}`);
console.log(`✅ Tool history: ${toolResult.modifiedCount}`);
console.log(`✅ Monitor assigned: ${assignedMonitorResult.modifiedCount}`);
console.log(`✅ Laptop assigned: ${assignedLaptopResult.modifiedCount}`);

console.log("\n✅ Fix completed!");

EOF

echo ""
echo "Done!"

