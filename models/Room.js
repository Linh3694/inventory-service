const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    // Sync từ Frappe - phải match với Frappe Room doctype
    frappeRoomId: { type: String, required: true, unique: true, index: true }, // Frappe name/ID
    name: { type: String, required: true },
    room_number: { type: String },
    room_name: { type: String },
    building: { type: String },
    floor: { type: String },
    block: { type: String },
    capacity: { type: Number },
    room_type: { type: String },
    status: { type: String, default: 'Active' },
    disabled: { type: Boolean, default: false },

    // Metadata từ Frappe
    frappeDoc: { type: mongoose.Schema.Types.Mixed }, // Store full Frappe doc
    lastSyncAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
roomSchema.index({ name: 1 });
roomSchema.index({ building: 1, floor: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ disabled: 1 });

// Static method to sync from Frappe
roomSchema.statics.syncFromFrappe = async function(frappeRoom) {
  if (!frappeRoom || typeof frappeRoom !== 'object') {
    throw new Error('Invalid Frappe room payload');
  }

  const frappeRoomId = frappeRoom.name || frappeRoom.room_id;
  if (!frappeRoomId) {
    throw new Error('Room ID is required from Frappe');
  }

  const update = {
    frappeRoomId,
    name: frappeRoom.room_name || frappeRoom.name,
    room_number: frappeRoom.room_number,
    room_name: frappeRoom.room_name,
    building: frappeRoom.building,
    floor: frappeRoom.floor,
    block: frappeRoom.block,
    capacity: frappeRoom.capacity,
    room_type: frappeRoom.room_type,
    status: frappeRoom.status || 'Active',
    disabled: frappeRoom.disabled || false,
    frappeDoc: frappeRoom, // Store full doc
    lastSyncAt: new Date(),
  };

  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  const doc = await this.findOneAndUpdate({ frappeRoomId }, update, options);

  return doc;
};

// Instance method to get display location
roomSchema.methods.getDisplayLocation = function() {
  const parts = [];
  if (this.building) parts.push(this.building);
  if (this.floor) parts.push(`tầng ${this.floor}`);
  if (this.room_number) parts.push(`phòng ${this.room_number}`);

  return parts.length > 0 ? parts.join(', ') : 'Không xác định';
};

module.exports = mongoose.model('Room', roomSchema);


