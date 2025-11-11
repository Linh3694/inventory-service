const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

/**
 * Device Service - Centralized service for device operations
 */
class DeviceService {
  // Device types mapping
  static DEVICE_MODELS = {
    laptop: Laptop,
    monitor: Monitor,
    printer: Printer,
    projector: Projector,
    phone: Phone,
    tool: Tool
  };

  /**
   * Lấy tất cả thiết bị của một phòng
   * @param {string} roomId - MongoDB ObjectId hoặc string ID hoặc room name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Mảng thiết bị
   */
  static async getDevicesByRoom(roomId, options = {}) {
    try {
      const {
        skip = 0,
        limit = 100,
        sort = { createdAt: -1 }
      } = options;

      const devices = [];

      console.log(`🔍 [DeviceService] Fetching devices for room: ${roomId}`);

      // Build query - support multiple formats for roomId
      const mongoose = require('mongoose');
      const query = {};
      
      // Support different roomId formats:
      // 1. MongoDB ObjectId (24-char hex string or actual ObjectId)
      // 2. Room name string (e.g., "Phòng Nhân Sự - Đào Tạo")
      // 3. Frappe Room ID (e.g., "ROOM-3264533")
      
      if (mongoose.Types.ObjectId.isValid(roomId)) {
        // Valid ObjectId - search by _id reference
        const objectId = new mongoose.Types.ObjectId(roomId);
        console.log(`   🔎 Searching as MongoDB ObjectId: ${objectId}`);
        query.room = objectId;
      } else {
        // String format - search by room name, frappeRoomId, or exact string match
        console.log(`   🔎 Searching as string/name: "${roomId}"`);
        query.$or = [
          { room: roomId },                    // Direct string match (if room is stored as string)
          { 'room.name': roomId },             // Match room's name field if populated
          { 'room.frappeRoomId': roomId },     // Match Frappe Room ID if populated
          { 'room._id': roomId }               // Match room's _id if it's somehow a string
        ];
      }

      console.log(`   📋 Query:`, JSON.stringify(query, null, 2));

      // Query tất cả collections
      for (const [type, Model] of Object.entries(this.DEVICE_MODELS)) {
        try {
          const items = await Model.find(query)
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .select('_id name serial status type manufacturer assigned createdAt updatedAt')
            .lean();

          if (items.length > 0) {
            console.log(`   ✅ Found ${items.length} ${type}(s) in room`);
            devices.push(...items);
          }
        } catch (error) {
          console.warn(`   ⚠️ Error querying ${type}:`, error.message);
          // Continue with other collections if one fails
        }
      }

      // Sort combined results by createdAt descending
      devices.sort((a, b) => 
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );

      console.log(`   📦 Total devices found: ${devices.length}`);

      return devices;
    } catch (error) {
      console.error('❌ [DeviceService] Error in getDevicesByRoom:', error);
      throw new Error(`Failed to fetch devices: ${error.message}`);
    }
  }

  /**
   * Lấy số lượng thiết bị của phòng
   * @param {string} roomId - MongoDB ObjectId hoặc room name/ID
   * @returns {Promise<number>} Số lượng thiết bị
   */
  static async getDeviceCountByRoom(roomId) {
    try {
      let totalCount = 0;

      // Build query - support multiple formats
      const mongoose = require('mongoose');
      const query = {};
      
      if (mongoose.Types.ObjectId.isValid(roomId)) {
        // Valid ObjectId
        query.room = new mongoose.Types.ObjectId(roomId);
      } else {
        // String format - search by multiple fields
        query.$or = [
          { room: roomId },                    // Direct string match
          { 'room.name': roomId },             // Match room's name field if populated
          { 'room.frappeRoomId': roomId },     // Match Frappe Room ID if populated
          { 'room._id': roomId }               // Match room's _id if it's a string
        ];
      }

      for (const [type, Model] of Object.entries(this.DEVICE_MODELS)) {
        try {
          const count = await Model.countDocuments(query);
          if (count > 0) {
            console.log(`   ✅ ${type}: ${count} device(s)`);
            totalCount += count;
          }
        } catch (error) {
          console.warn(`   ⚠️ Error counting ${type}:`, error.message);
        }
      }

      return totalCount;
    } catch (error) {
      console.error('❌ [DeviceService] Error in getDeviceCountByRoom:', error);
      throw error;
    }
  }

  /**
   * Lấy thiết bị của phòng theo loại
   * @param {string} roomId - MongoDB ObjectId của phòng
   * @param {string} type - Loại thiết bị (laptop, monitor, printer, etc.)
   * @returns {Promise<Array>} Mảng thiết bị theo loại
   */
  static async getDevicesByRoomAndType(roomId, type) {
    const Model = this.DEVICE_MODELS[type.toLowerCase()];
    if (!Model) {
      throw new Error(`Invalid device type: ${type}`);
    }

    return await Model.find({ room: roomId })
      .select('_id name serial status type manufacturer assigned createdAt updatedAt')
      .lean();
  }

  /**
   * Lấy danh sách toàn bộ device types
   * @returns {Array} Danh sách loại thiết bị hỗ trợ
   */
  static getDeviceTypes() {
    return Object.keys(this.DEVICE_MODELS);
  }
}

module.exports = DeviceService;

