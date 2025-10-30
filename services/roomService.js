const axios = require('axios');
const Room = require('../models/Room');

const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

/**
 * Service để quản lý Room data từ Frappe
 */
class RoomService {

  /**
   * Fetch room details từ Frappe API
   */
  async getFrappeRoom(roomId, token) {
    try {
      const response = await axios.get(
        `${FRAPPE_API_URL}/api/resource/ERP Administrative Room/${roomId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Frappe-CSRF-Token': token
          }
        }
      );
      return response.data.data;
    } catch (error) {
      console.warn(`⚠️ [Room Service] Failed to fetch room ${roomId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch tất cả rooms từ Frappe API
   */
  async getAllFrappeRooms(token) {
    try {
      console.log('🔍 [Room Service] Fetching all Frappe rooms...');

      const response = await axios.get(
        `${FRAPPE_API_URL}/api/resource/ERP Administrative Room`,
        {
          params: {
            limit_page_length: 1000,
            order_by: 'name asc'
          },
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Frappe-CSRF-Token': token
          }
        }
      );

      let rooms = response.data.data || [];
      console.log(`✅ Found ${rooms.length} rooms in Frappe`);

      return rooms;
    } catch (error) {
      console.error('❌ [Room Service] Error fetching Frappe rooms:', error.message);
      return [];
    }
  }

  /**
   * Sync tất cả rooms từ Frappe
   */
  async syncAllRoomsFromFrappe(token) {
    try {
      console.log('🔄 [Room Service] Starting full room sync...');

      const frappeRooms = await this.getAllFrappeRooms(token);

      let synced = 0;
      let failed = 0;

      for (const frappeRoom of frappeRooms) {
        try {
          await Room.syncFromFrappe(frappeRoom);
          synced++;
        } catch (error) {
          console.error(`❌ Failed to sync room ${frappeRoom.name}: ${error.message}`);
          failed++;
        }
      }

      console.log(`✅ [Room Service] Room sync complete: ${synced} synced, ${failed} failed`);

      return { synced, failed, total: synced + failed };
    } catch (error) {
      console.error('❌ [Room Service] Error in full sync:', error.message);
      throw error;
    }
  }

  /**
   * Get room by Frappe ID (dùng cho populate)
   */
  async getRoomByFrappeId(frappeRoomId) {
    return await Room.findOne({ frappeRoomId }).lean();
  }

  /**
   * Validate room ID exists
   */
  async validateRoomId(frappeRoomId) {
    const room = await this.getRoomByFrappeId(frappeRoomId);
    return !!room;
  }

  /**
   * Get rooms for selection (dropdown)
   */
  async getRoomsForSelection(filters = {}) {
    const query = { disabled: false, ...filters };
    return await Room.find(query)
      .select('frappeRoomId name room_number building floor block status')
      .sort({ building: 1, floor: 1, room_number: 1 })
      .lean();
  }

  /**
   * Search rooms
   */
  async searchRooms(searchTerm, limit = 50) {
    const query = {
      disabled: false,
      $or: [
        { name: new RegExp(searchTerm, 'i') },
        { room_number: new RegExp(searchTerm, 'i') },
        { building: new RegExp(searchTerm, 'i') }
      ]
    };

    return await Room.find(query)
      .select('frappeRoomId name room_number building floor block status')
      .limit(limit)
      .sort({ name: 1 })
      .lean();
  }
}

module.exports = new RoomService();
