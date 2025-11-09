const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../config.env') });

// Import models
const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

const models = [
  { name: 'Laptop', model: Laptop },
  { name: 'Monitor', model: Monitor },
  { name: 'Printer', model: Printer },
  { name: 'Projector', model: Projector },
  { name: 'Phone', model: Phone },
  { name: 'Tool', model: Tool },
];

async function syncDocumentsInHistory() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let totalDevices = 0;
    let totalFixed = 0;
    let totalHistoryEntries = 0;

    for (const { name, model } of models) {
      console.log(`\n📱 Processing ${name}s...`);
      
      const devices = await model.find({});
      let modelFixed = 0;
      let modelHistoryFixed = 0;

      for (const device of devices) {
        if (!device.assignmentHistory || device.assignmentHistory.length === 0) {
          continue;
        }

        let deviceChanged = false;
        const history = device.assignmentHistory;

        // Iterate through history entries
        for (let i = 0; i < history.length; i++) {
          const entry = history[i];
          
          // Find entries that are "closed" (have endDate) but missing document
          if (entry.endDate && !entry.document) {
            // Look for document from previous entries
            let foundDocument = null;
            
            // Search backwards from current position
            for (let j = i - 1; j >= 0; j--) {
              if (history[j].document) {
                foundDocument = history[j].document;
                break;
              }
            }
            
            // If found a document from previous entry, assign it
            if (foundDocument) {
              entry.document = foundDocument;
              deviceChanged = true;
              modelHistoryFixed++;
              console.log(
                `  📄 Entry ${i}: Synced document from previous entry: ${foundDocument}`
              );
            } else {
              console.log(
                `  ⚠️  Entry ${i}: No previous document found (user: ${entry.userName})`
              );
            }
          }
        }

        // Save device if changes were made
        if (deviceChanged) {
          await device.save();
          modelFixed++;
          totalHistoryEntries += modelHistoryFixed;
        }
      }

      totalDevices += devices.length;
      totalFixed += modelFixed;

      console.log(`  ✅ ${name}: ${modelFixed}/${devices.length} devices updated (${modelHistoryFixed} history entries synced)`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`  Total devices processed: ${totalDevices}`);
    console.log(`  Total devices updated: ${totalFixed}`);
    console.log(`  Total history entries synced: ${totalHistoryEntries}`);
    console.log(`\n✅ Document synchronization complete!`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

syncDocumentsInHistory();

