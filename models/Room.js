const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    // Sync từ Frappe - phải match với Frappe Room doctype
    frappeRoomId: { type: String, required: true, unique: true, index: true }, // Frappe name/ID
    name: { type: String, required: true },
    room_number: { type: String },
    room_name: { type: String },
    room_name_en: { type: String }, // English room name
    short_title: { type: String }, // Room short title/code

    // Building information
    building: { type: String }, // Building ID
    building_name: { type: String }, // Building display name
    building_name_vn: { type: String }, // Vietnamese building name
    building_name_en: { type: String }, // English building name
    building_short_title: { type: String }, // Building short title

    // Legacy fields (kept for backward compatibility)
    floor: { type: String },
    block: { type: String },

    // Additional fields
    campus_id: { type: String }, // Campus ID
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
roomSchema.index({ room_name: 1 });
roomSchema.index({ building: 1 });
roomSchema.index({ building_name: 1 });
roomSchema.index({ campus_id: 1 });
roomSchema.index({ room_type: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ disabled: 1 });

// Compound indexes
roomSchema.index({ building: 1, floor: 1 }); // Legacy
roomSchema.index({ campus_id: 1, building: 1 }); // New compound index

// Static method to sync from Frappe
roomSchema.statics.syncFromFrappe = async function(frappeRoom) {
  if (!frappeRoom || typeof frappeRoom !== 'object') {
    throw new Error('Invalid Frappe room payload');
  }

  const frappeRoomId = frappeRoom.name || frappeRoom.room_id || frappeRoom.frappeRoomId;
  if (!frappeRoomId) {
    throw new Error('Room ID is required from Frappe');
  }

  // Handle building information - support both old and new formats
  let buildingInfo = {};
  if (frappeRoom.building && typeof frappeRoom.building === 'object') {
    // New webhook format with full building object
    buildingInfo = {
      id: frappeRoom.building.name,
      name: frappeRoom.building.title_vn || frappeRoom.building.title_en,
      name_vn: frappeRoom.building.title_vn,
      name_en: frappeRoom.building.title_en,
      short_title: frappeRoom.building.short_title,
      campus_id: frappeRoom.building.campus_id
    };
  } else {
    // Legacy format or direct fields
    buildingInfo = {
      id: frappeRoom.building_id || frappeRoom.building,
      name: frappeRoom.building_name || frappeRoom.building_title,
      name_vn: frappeRoom.building_name_vn,
      name_en: frappeRoom.building_name_en,
      short_title: frappeRoom.building_short_title,
      campus_id: frappeRoom.campus_id
    };
  }

  const update = {
    frappeRoomId,
    name: frappeRoom.title_vn || frappeRoom.room_name || frappeRoom.name,
    room_number: frappeRoom.short_title || frappeRoom.room_number,
    room_name: frappeRoom.title_vn || frappeRoom.room_name,
    room_name_en: frappeRoom.title_en || frappeRoom.room_name_en,
    short_title: frappeRoom.short_title,
    building: buildingInfo.id,
    building_name: buildingInfo.name,
    building_name_vn: buildingInfo.name_vn,
    building_name_en: buildingInfo.name_en,
    building_short_title: buildingInfo.short_title,
    campus_id: frappeRoom.campus_id || buildingInfo.campus_id,
    floor: frappeRoom.floor,
    block: frappeRoom.block,
    capacity: frappeRoom.capacity,
    room_type: frappeRoom.room_type,
    status: 'Active', // Always active since we removed status field
    disabled: false,  // Always enabled since we removed disabled field
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

  // Use building_name if available, otherwise fallback to building ID
  const buildingDisplay = this.building_name || this.building;
  if (buildingDisplay) parts.push(buildingDisplay);

  // Include floor if available (legacy field)
  if (this.floor) parts.push(`tầng ${this.floor}`);

  // Use room_number or short_title
  const roomDisplay = this.room_number || this.short_title;
  if (roomDisplay) parts.push(`phòng ${roomDisplay}`);

  return parts.length > 0 ? parts.join(', ') : 'Không xác định';
};

module.exports = mongoose.model('Room', roomSchema);


