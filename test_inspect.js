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

    // Test new logic: don't populate inspectorId first to avoid User model error
    const inspections = await Inspect.find(filter);
    console.log('Inspections found:', inspections.length);

    if (inspections.length > 0) {
      const inspection = inspections[0];
      console.log('First inspection deviceType:', inspection.deviceType);
      console.log('First inspection deviceId:', inspection.deviceId);

      // Custom populate for deviceId based on deviceType
      const deviceModels = {
        'Laptop': require('./models/Laptop'),
        'Monitor': require('./models/Monitor'),
        'Printer': require('./models/Printer'),
        'Projector': require('./models/Projector'),
        'Tool': require('./models/Tool'),
        'Phone': require('./models/Phone')
      };

      if (inspection.deviceId && inspection.deviceType && deviceModels[inspection.deviceType]) {
        try {
          const device = await deviceModels[inspection.deviceType].findById(inspection.deviceId);
          console.log('Device found:', device ? device.name : 'null');
          inspection._doc.deviceId = device;
        } catch (populateError) {
          console.warn('Failed to populate device:', populateError.message);
        }
      }

      console.log('Final inspection:', {
        id: inspection._id,
        deviceType: inspection.deviceType,
        deviceName: inspection.deviceId?.name || 'Not populated',
        inspectorName: inspection.inspectorId?.fullname || 'Not populated'
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testInspectQuery();
