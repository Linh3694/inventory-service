const mongoose = require('mongoose');

const assignmentHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String },
  jobTitle: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  notes: { type: String },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedReason: { type: [String], default: [] },
  document: { type: String },
});

const phoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, default: 'Phone' },
    manufacturer: { type: String },
    serial: { type: String, required: true },
    imei1: { type: String, required: true },
    imei2: { type: String },
    phoneNumber: { type: String },
    releaseYear: { type: Number },
    assigned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignmentHistory: [assignmentHistorySchema],
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    status: { type: String, enum: ['Active', 'Standby', 'Broken', 'PendingDocumentation'] },
    brokenReason: { type: String, default: null },
    brokenDescription: { type: String, default: null },
    specs: {
      processor: { type: String },
      ram: { type: String },
      storage: { type: String },
      display: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Phone', phoneSchema);


