const mongoose = require('mongoose');
const Inspect = require('./models/Inspect');
require('dotenv').config({ path: './config.env' });

async function testInspectQuery() {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI ||
      `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'inventory_service'}`;

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Test the query from inspectController
    const deviceId = '68ff26dc9247718bbab40f88';
    const filter = {};
    filter.deviceId = deviceId;

    console.log('Filter:', filter);

    const inspections = await Inspect.find(filter).populate('deviceId inspectorId');
    console.log('Inspections found:', inspections.length);
    console.log('First inspection:', inspections[0] || 'None');

    // Test without populate
    const inspectionsNoPopulate = await Inspect.find(filter);
    console.log('Inspections without populate:', inspectionsNoPopulate.length);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testInspectQuery();
