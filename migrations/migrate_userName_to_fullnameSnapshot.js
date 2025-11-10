/**
 * Migration Script: Copy userName to fullnameSnapshot
 * 
 * Purpose: Migrate existing assignmentHistory records from deprecated 'userName' 
 *          field to new 'fullnameSnapshot' field
 * 
 * Run: node migrations/migrate_userName_to_fullnameSnapshot.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import all device models
const Monitor = require('../models/Monitor');
const Laptop = require('../models/Laptop');
const Phone = require('../models/Phone');
const Projector = require('../models/Projector');
const Printer = require('../models/Printer');
const Tool = require('../models/Tool');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

async function migrateCollection(Model, collectionName) {
  console.log(`\n📦 Migrating ${collectionName}...`);
  
  try {
    // Find all documents that have assignmentHistory with userName but no fullnameSnapshot
    const documents = await Model.find({
      'assignmentHistory': { $exists: true, $ne: [] }
    });

    console.log(`   Found ${documents.length} documents with assignment history`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of documents) {
      let hasUpdates = false;

      doc.assignmentHistory.forEach(history => {
        // If userName exists but fullnameSnapshot doesn't, copy it
        if (history.userName && !history.fullnameSnapshot) {
          history.fullnameSnapshot = history.userName;
          hasUpdates = true;
          console.log(`   ✓ Copied userName "${history.userName}" to fullnameSnapshot`);
        } else if (history.fullnameSnapshot) {
          skippedCount++;
        }
      });

      if (hasUpdates) {
        await doc.save();
        updatedCount++;
      }
    }

    console.log(`   ✅ Updated ${updatedCount} documents in ${collectionName}`);
    console.log(`   ⏭️  Skipped ${skippedCount} history entries (already have fullnameSnapshot)`);
    
    return { updated: updatedCount, skipped: skippedCount };
  } catch (error) {
    console.error(`   ❌ Error migrating ${collectionName}:`, error.message);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('🚀 Starting migration: userName → fullnameSnapshot');
    console.log(`📍 Connecting to: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const collections = [
      { model: Monitor, name: 'Monitors' },
      { model: Laptop, name: 'Laptops' },
      { model: Phone, name: 'Phones' },
      { model: Projector, name: 'Projectors' },
      { model: Printer, name: 'Printers' },
      { model: Tool, name: 'Tools' }
    ];

    const results = {
      totalUpdated: 0,
      totalSkipped: 0
    };

    for (const { model, name } of collections) {
      const result = await migrateCollection(model, name);
      results.totalUpdated += result.updated;
      results.totalSkipped += result.skipped;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   - Total documents updated: ${results.totalUpdated}`);
    console.log(`   - Total history entries skipped: ${results.totalSkipped}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\n✨ All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };

