const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ['repair', 'update'], required: true },
    description: { type: String, required: true },
    details: { type: String },
    date: { type: Date, required: true, default: Date.now },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', activitySchema);


