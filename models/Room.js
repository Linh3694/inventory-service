const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: [
      {
        building: { type: String },
        floor: { type: String },
      },
    ],
    status: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);


