const mongoose = require('mongoose');

const InspectSchema = new mongoose.Schema({
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  deviceType: { type: String, required: true },
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  inspectionDate: { type: Date, default: Date.now },
  results: {
    externalCondition: { overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    cpu: { performance: String, temperature: String, overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    ram: { consumption: String, overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    storage: { remainingCapacity: String, overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    battery: { capacity: String, performance: String, chargeCycles: String, overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    display: { colorAndBrightness: { type: String, default: '' }, overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    connectivity: { overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
    software: { overallCondition: { type: String, default: '' }, notes: { type: String, default: '' } },
  },
  overallAssessment: { type: String, default: '' },
  passed: { type: Boolean, default: true },
  recommendations: String,
  technicalConclusion: { type: String, default: '' },
  followUpRecommendation: { type: String, default: '' },
  report: { fileName: String, filePath: String, createdAt: { type: Date, default: Date.now } },
});

module.exports = mongoose.model('Inspect', InspectSchema);


