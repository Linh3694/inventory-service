const axios = require('axios');
const Room = require('../models/Room');

const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

// Helper function to format Frappe room data
function formatFrappeRoom(frappeRoom) {
  return {
    frappeRoomId: frappeRoom.name || frappeRoom.room_id,
    name: frappeRoom.room_name || frappeRoom.title_vn || frappeRoom.name,
    room_number: frappeRoom.room_number || frappeRoom.short_title,
    room_name: frappeRoom.room_name || frappeRoom.title_vn,
    room_name_en: frappeRoom.room_name_en || frappeRoom.title_en,
    short_title: frappeRoom.short_title,
    building: frappeRoom.building || frappeRoom.building_id,
    floor: frappeRoom.floor,
    block: frappeRoom.block,
    capacity: frappeRoom.capacity,
    room_type: frappeRoom.room_type,
    status: frappeRoom.status || 'Active',
    disabled: frappeRoom.disabled || false,
    frappeDoc: frappeRoom,
    lastSyncAt: new Date()
  };
}

// Fetch room details từ Frappe
async function getFrappeRoomDetail(roomId, token) {
  try {
    // Try 'ERP Administrative Room' first
    let response;
    try {
      response = await axios.get(
        `${FRAPPE_API_URL}/api/resource/ERP%20Administrative%20Room/${roomId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Frappe-CSRF-Token': token
          }
        }
      );
    } catch (e) {
      // Fallback to 'Room'
      if (e.response?.status === 404) {
        response = await axios.get(
          `${FRAPPE_API_URL}/api/resource/Room/${roomId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Frappe-CSRF-Token': token
            }
          }
        );
      } else {
        throw e;
      }
    }
    return response.data.data;
  } catch (error) {
    console.warn(`⚠️  Failed to fetch room ${roomId}: ${error.message}`);
    return null;
  }
}

// Fetch all rooms từ Frappe
async function getAllFrappeRooms(token) {
  try {
    console.log('🔍 [Sync] Fetching all rooms from Frappe...');

    // Use custom endpoint để lấy TẤT CẢ rooms (không bị limit campus)
    let response;
    let endpoint = '';
    try {
      endpoint = `${FRAPPE_API_URL}/api/method/erp.api.erp_administrative.room.get_all_rooms_for_sync`;
      console.log(`📡 Trying endpoint: ${endpoint}`);
      response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Frappe-CSRF-Token': token
        }
      });
      console.log(`✅ Endpoint responded with status: ${response.status}`);
      console.log(`📦 Response data:`, JSON.stringify(response.data, null, 2));
    } catch (e) {
      // Fallback to older custom endpoint if new one doesn't exist
      console.log(`❌ Endpoint failed: ${e.message}`);
      if (e.response?.status === 404) {
        console.log('⚠️  Sync endpoint not found, trying standard endpoint...');
        try {
          endpoint = `${FRAPPE_API_URL}/api/method/erp.api.erp_administrative.room.get_all_rooms`;
          console.log(`📡 Trying endpoint: ${endpoint}`);
          response = await axios.get(endpoint, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Frappe-CSRF-Token': token
            }
          });
          console.log(`✅ Endpoint responded with status: ${response.status}`);
          console.log(`📦 Response data:`, JSON.stringify(response.data, null, 2));
        } catch (e2) {
          // Final fallback to resource API with pagination
          console.log(`❌ Endpoint failed: ${e2.message}`);
          if (e2.response?.status === 404) {
            console.log('⚠️  Custom endpoints not found, using resource API...');
            endpoint = `${FRAPPE_API_URL}/api/resource/ERP%20Administrative%20Room`;
            console.log(`📡 Trying endpoint: ${endpoint}`);
            response = await axios.get(endpoint, {
              params: {
                fields: JSON.stringify(['name', 'room_name', 'room_number', 'building', 'floor', 'block', 'capacity', 'room_type', 'status', 'disabled']),
                limit_start: 0,
                limit_page_length: 500
              },
              headers: {
                'Authorization': `Bearer ${token}`,
                'X-Frappe-CSRF-Token': token
              }
            });
            console.log(`✅ Endpoint responded with status: ${response.status}`);
            console.log(`📦 Response data:`, JSON.stringify(response.data, null, 2));
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    // Handle custom endpoint response format
    let rooms = [];
    console.log(`🔍 Parsing response...`);
    console.log(`   - response.data.success: ${response.data.success}`);
    console.log(`   - response.data.message type: ${typeof response.data.message}`);
    
    // Frappe endpoint wraps response in "message" property
    if (response.data.message && typeof response.data.message === 'object') {
      if (response.data.message.success && response.data.message.data && Array.isArray(response.data.message.data)) {
        // Frappe custom endpoint format: response.message.data
        console.log(`✅ Using Frappe custom endpoint format (message.success + message.data)`);
        rooms = response.data.message.data;
      } else if (response.data.message.data && Array.isArray(response.data.message.data)) {
        // Alternative Frappe format
        console.log(`✅ Using Frappe message.data array format`);
        rooms = response.data.message.data;
      } else if (Array.isArray(response.data.message)) {
        // Message is directly array
        console.log(`✅ Using message array format`);
        rooms = response.data.message;
      }
    } else if (response.data.success && response.data.data && Array.isArray(response.data.data)) {
      // Direct success + data format
      console.log(`✅ Using direct success + data format`);
      rooms = response.data.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      // Direct data array
      console.log(`✅ Using direct data array format`);
      rooms = response.data.data;
    } else {
      console.log(`⚠️  No matching format found, checking full response structure`);
      console.log(`   Full response keys:`, Object.keys(response.data));
      if (response.data.message && typeof response.data.message === 'object') {
        console.log(`   Message keys:`, Object.keys(response.data.message));
      }
    }

    console.log(`✅ Found ${rooms.length} rooms from Frappe`);
    if (rooms.length > 0) {
      console.log(`📋 Sample room: ${JSON.stringify(rooms[0], null, 2)}`);
    }

    return rooms;
  } catch (error) {
    console.error('❌ [Sync] Error fetching rooms:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// ✅ ENDPOINT 1: Manual sync all rooms
exports.syncRoomsManual = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' });
    }

    console.log('🔄 [Inventory Sync] Starting room sync...');
    const startTime = Date.now();

    const frappeRooms = await getAllFrappeRooms(token);

    if (frappeRooms.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No rooms to sync',
        stats: { synced: 0, failed: 0, total: 0 }
      });
    }

    let synced = 0;
    let failed = 0;
    const batchSize = 20;

    for (let i = 0; i < frappeRooms.length; i += batchSize) {
      const batch = frappeRooms.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (frappeRoom) => {
          const roomData = formatFrappeRoom(frappeRoom);
          await Room.findOneAndUpdate(
            { frappeRoomId: frappeRoom.name },
            { $set: roomData },
            { upsert: true, new: true }
          );
          return { frappeRoomId: frappeRoom.name };
        })
      );

      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          synced++;
        } else {
          failed++;
        }
      });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Inventory Sync] Room sync complete: ${synced} synced, ${failed} failed in ${duration}s`);

    res.status(200).json({
      success: true,
      message: 'Room sync completed',
      stats: {
        synced,
        failed,
        total: synced + failed
      }
    });
  } catch (error) {
    console.error('❌ [Inventory Sync] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 2: Debug fetch rooms
exports.debugFetchRooms = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token required' });
    }

    let listResponse;
    try {
      listResponse = await axios.get(
        `${FRAPPE_API_URL}/api/method/erp.api.erp_administrative.room.get_all_rooms`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Frappe-CSRF-Token': token
          }
        }
      );
    } catch (e) {
      if (e.response?.status === 404) {
        console.log('⚠️  Custom endpoint not found, using resource API...');
        listResponse = await axios.get(
          `${FRAPPE_API_URL}/api/resource/ERP%20Administrative%20Room`,
          {
            params: {
              fields: JSON.stringify(['name', 'room_name', 'room_number', 'building', 'floor', 'block', 'capacity', 'room_type', 'status', 'disabled']),
              limit_start: 0,
              limit_page_length: 10,
              order_by: 'name asc'
            },
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Frappe-CSRF-Token': token
            }
          }
        );
      } else {
        throw e;
      }
    }

    let roomList = [];
    let totalCount = 0;
    
    // Handle custom endpoint response format
    if (listResponse.data.success && listResponse.data.data) {
      roomList = listResponse.data.data;
      totalCount = listResponse.data.meta?.total_count || roomList.length;
    } else if (listResponse.data.data) {
      // Resource API format
      roomList = listResponse.data.data;
      totalCount = listResponse.data.total_count || listResponse.data.total || roomList.length;
    } else if (listResponse.data.message && Array.isArray(listResponse.data.message)) {
      roomList = listResponse.data.message;
      totalCount = roomList.length;
    }

    console.log(`📦 Found ${roomList.length} rooms (total_count: ${totalCount})`);

    const sampleRooms = roomList.slice(0, 5).map(room => ({
      name: room.name,
      room_name: room.room_name || room.title_vn || room.name,
      building: room.building_id || room.building,
      floor: room.floor,
      room_number: room.room_number,
      capacity: room.capacity,
      status: room.status
    }));

    res.status(200).json({
      success: true,
      message: 'Debug fetch completed',
      sample_rooms: sampleRooms,
      total_count: totalCount
    });
  } catch (error) {
    console.error('❌ [Debug] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 3: Sync room by ID
exports.syncRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token required'
      });
    }
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID parameter required'
      });
    }
    
    console.log(`🏢 [Sync Room] Syncing room: ${roomId}`);
    
    const frappeRoom = await getFrappeRoomDetail(roomId, token);
    
    if (!frappeRoom) {
      return res.status(404).json({
        success: false,
        message: `Room not found in Frappe: ${roomId}`
      });
    }
    
    if (frappeRoom.disabled) {
      console.log(`⏭️  Skipping disabled room: ${roomId}`);
      return res.status(200).json({
        success: true,
        message: 'Room is disabled, skipped'
      });
    }
    
    const roomData = formatFrappeRoom(frappeRoom);
    const result = await Room.findOneAndUpdate(
      { frappeRoomId: roomId },
      roomData,
      { upsert: true, new: true }
    );
    
    console.log(`✅ [Sync Room] Room synced: ${roomId}`);
    
    res.status(200).json({
      success: true,
      message: 'Room synced successfully',
      room: {
        frappeRoomId: result.frappeRoomId,
        name: result.name,
        building: result.building,
        floor: result.floor
      }
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ ENDPOINT 4: Webhook - Room changed in Frappe
exports.webhookRoomChanged = async (req, res) => {
  try {
    const { doc, event } = req.body;

    if (process.env.DEBUG_WEBHOOK === '1') {
      console.log('🔔 [Webhook] Raw payload:', JSON.stringify(req.body, null, 2));
    }

    let actualEvent = event;
    if (typeof event === 'string' && event.includes('{{')) {
      actualEvent = 'update';
    }

    console.log(`🔔 [Webhook] Room ${actualEvent}: ${doc?.name}`);

    if (!doc || !doc.name) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }
    
    if (actualEvent === 'delete' || actualEvent === 'on_trash') {
      console.log(`🗑️  Deleting room: ${doc.name}`);
      await Room.deleteOne({ frappeRoomId: doc.name });
      
      return res.status(200).json({
        success: true,
        message: 'Room deleted'
      });
    }
    
    if (actualEvent === 'insert' || actualEvent === 'update' || actualEvent === 'after_insert' || actualEvent === 'on_update') {
      if (doc.disabled) {
        console.log(`⏭️  Skipping disabled room: ${doc.name}`);
        return res.status(200).json({
          success: true,
          message: 'Room is disabled, skipped'
        });
      }
      
      const roomData = formatFrappeRoom(doc);
      const result = await Room.findOneAndUpdate(
        { frappeRoomId: doc.name },
        roomData,
        { upsert: true, new: true }
      );
      
      console.log(`✅ Room synced: ${result.frappeRoomId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Room synced',
        room: {
          frappeRoomId: result.frappeRoomId,
          name: result.name
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Event processed'
    });
  } catch (error) {
    console.error('❌ [Webhook] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

