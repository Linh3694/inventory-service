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
   * @param {string} roomId - MongoDB ObjectId hoặc string ID của phòng
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

      // Query tất cả collections
      for (const [type, Model] of Object.entries(this.DEVICE_MODELS)) {
        try {
          const items = await Model.find({ room: roomId })
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
   * @param {string} roomId - MongoDB ObjectId của phòng
   * @returns {Promise<number>} Số lượng thiết bị
   */
  static async getDeviceCountByRoom(roomId) {
    try {
      let totalCount = 0;

      for (const [type, Model] of Object.entries(this.DEVICE_MODELS)) {
        try {
          const count = await Model.countDocuments({ room: roomId });
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

