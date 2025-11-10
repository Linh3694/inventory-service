const mongoose = require('mongoose');
const Room = require('../models/Room');

/**
 * Resolve room ID from either MongoDB ObjectId or Frappe room ID (string)
 * @param {string} roomInput - Either MongoDB ObjectId or Frappe room ID
 * @returns {Promise<string|null>} - MongoDB ObjectId of the room, or null if not found
 */
async function resolveRoomId(roomInput) {
  if (!roomInput) return null;

  // If it's already a valid MongoDB ObjectId, return as is
  if (mongoose.Types.ObjectId.isValid(roomInput)) {
    return roomInput;
  }

  // Otherwise, try to find by Frappe room ID
  try {
    console.log(`🔍 [Room Resolver] Looking up Room by Frappe ID: ${roomInput}`);
    const roomDoc = await Room.findOne({ frappeRoomId: roomInput });
    
    if (!roomDoc) {
      console.warn(`⚠️ [Room Resolver] Room not found: ${roomInput}`);
      return null;
    }
    
    console.log(`✅ [Room Resolver] Resolved Frappe room ${roomInput} → MongoDB ID: ${roomDoc._id}`);
    return roomDoc._id;
  } catch (error) {
    console.error(`❌ [Room Resolver] Error resolving room:`, error.message);
    throw error;
  }
}

module.exports = {
  resolveRoomId
};

