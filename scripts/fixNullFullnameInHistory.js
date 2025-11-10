const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Models
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
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function fixNullFullnames() {
  let totalFixed = 0;
  let totalErrors = 0;

  for (const Model of models) {
    console.log(`\n🔍 Processing ${Model.modelName}...`);

    try {
      // Find all documents
      const documents = await Model.find({});
      console.log(`   Found ${documents.length} ${Model.modelName} documents`);

      for (const doc of documents) {
        if (!doc.assignmentHistory || doc.assignmentHistory.length === 0) {
          continue;
        }

        let docChanged = false;

        for (let i = 0; i < doc.assignmentHistory.length; i++) {
          const history = doc.assignmentHistory[i];

          // Check if fullname is null or missing
          if (
            history.user &&
            (!history.fullname || history.fullname === null || history.fullname === undefined)
          ) {
            try {
              // Find user by ID
              const user = await User.findById(history.user);

              if (user && user.fullname) {
                // Update the history entry
                doc.assignmentHistory[i].fullname = user.fullname;
                docChanged = true;
                totalFixed++;
                console.log(
                  `   ✏️  Fixed: ${Model.modelName} (${doc._id}) - History ${history._id}: ${user.fullname}`
                );
              } else if (!user) {
                console.log(
                  `   ⚠️  User not found: ${Model.modelName} (${doc._id}) - User ID: ${history.user}`
                );
              } else {
                console.log(
                  `   ⚠️  User has no fullname: ${Model.modelName} (${doc._id}) - User ID: ${history.user}`
                );
              }
            } catch (error) {
              console.error(
                `   ❌ Error fixing ${Model.modelName} (${doc._id}) - History ${history._id}:`,
                error.message
              );
              totalErrors++;
            }
          }
        }

        // Save if document was changed
        if (docChanged) {
          try {
            await doc.save();
            console.log(`   💾 Saved ${Model.modelName} (${doc._id})`);
          } catch (error) {
            console.error(`   ❌ Error saving ${Model.modelName} (${doc._id}):`, error.message);
            totalErrors++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error processing ${Model.modelName}:`, error.message);
      totalErrors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   ✅ Total fixed: ${totalFixed}`);
  console.log(`   ❌ Total errors: ${totalErrors}`);
  console.log('='.repeat(50));

  return { totalFixed, totalErrors };
}

async function main() {
  try {
    await connectDB();
    console.log('🚀 Starting to fix null fullnames in assignment history...\n');

    const result = await fixNullFullnames();

    if (result.totalErrors === 0) {
      console.log('\n✅ All fixes completed successfully!');
    } else {
      console.log('\n⚠️  Completed with some errors. Please check the logs above.');
    }

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(result.totalErrors === 0 ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

