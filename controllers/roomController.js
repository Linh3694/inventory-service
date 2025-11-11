const axios = require('axios');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const DeviceService = require('../services/deviceService');
const { populateBuildingInRoom } = require('../utils/roomHelper');

const FRAPPE_API_URL = process.env.FRAPPE_API_URL || 'https://admin.sis.wellspring.edu.vn';

// Helper function to format Frappe room data
function formatFrappeRoom(frappeRoom) {
  // Handle building information - prioritize building object if available
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
    // Legacy format or fallback
    buildingInfo = {
      id: frappeRoom.building_id || frappeRoom.building,
      name: frappeRoom.building_name || frappeRoom.building_title,
      campus_id: frappeRoom.campus_id
    };
  }

  return {
    frappeRoomId: frappeRoom.name || frappeRoom.room_id,
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
    capacity: frappeRoom.capacity,
    room_type: frappeRoom.room_type,
    status: 'Active', // Always active since we removed status field
    disabled: false,  // Always enabled since we removed disabled field
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
                fields: JSON.stringify(['name', 'title_vn', 'title_en', 'short_title', 'building_id', 'campus_id', 'capacity', 'room_type']),
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
              fields: JSON.stringify(['name', 'title_vn', 'title_en', 'short_title', 'building_id', 'campus_id', 'capacity', 'room_type']),
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
      room_name: room.title_vn || room.room_name || room.name,
      room_name_en: room.title_en || room.room_name_en,
      short_title: room.short_title,
      building: room.building_id || room.building,
      campus_id: room.campus_id,
      capacity: room.capacity,
      room_type: room.room_type
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

// ✅ ENDPOINT 4: Get all rooms with full information for frontend
exports.getAllRooms = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      building,
      campus_id,
      room_type,
      status = 'Active'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { disabled: { $ne: true } }; // Exclude disabled rooms

    if (status && status !== 'all') {
      query.status = status;
    }

    if (building) {
      query.building = building;
    }

    if (campus_id) {
      query.campus_id = campus_id;
    }

    if (room_type) {
      query.room_type = room_type;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { room_name: { $regex: search, $options: 'i' } },
        { room_name_en: { $regex: search, $options: 'i' } },
        { short_title: { $regex: search, $options: 'i' } },
        { building_name: { $regex: search, $options: 'i' } },
        { building_name_vn: { $regex: search, $options: 'i' } },
        { building_name_en: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count for pagination
    const totalItems = await Room.countDocuments(query);

    // Get rooms with sorting
    const rooms = await Room.find(query)
      .sort({ building_name: 1, room_name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Transform rooms to include building object
    const transformedRooms = rooms.map(room => populateBuildingInRoom(room));

    const totalPages = Math.ceil(totalItems / limitNum);

    res.status(200).json({
      success: true,
      data: transformedRooms,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        itemsPerPage: limitNum,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      meta: {
        total_count: totalItems,
        filters: {
          search: search || null,
          building: building || null,
          campus_id: campus_id || null,
          room_type: room_type || null,
          status: status || 'Active'
        }
      }
    });

  } catch (error) {
    console.error('❌ [Get Rooms] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách phòng',
      error: error.message
    });
  }
};

// ✅ ENDPOINT 5: Get room by Frappe ID or MongoDB ObjectId
exports.getRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }

    console.log(`🔍 [Get Room by ID] Searching for room: ${roomId}`);

    // Build query - support multiple roomId formats
    const query = {
      $or: [
        { frappeRoomId: roomId },        // Search by Frappe Room ID (e.g., "ROOM-3264533")
        { name: roomId },                 // Search by room name
      ]
    };

    // Only add ObjectId query if the roomId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(roomId)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(roomId) }); // Search by MongoDB _id
    }

    const room = await Room.findOne(query).lean();

    if (!room) {
      console.log(`   ❌ Room not found for: ${roomId}`);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phòng'
      });
    }

    console.log(`   ✅ Found room: ${room._id}`);

    // Transform room to include building object
    const transformedRoom = populateBuildingInRoom(room);

    res.status(200).json({
      success: true,
      data: transformedRoom
    });

  } catch (error) {
    console.error('❌ [Get Room by ID] Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin phòng',
      error: error.message
    });
  }
};

// ✅ ENDPOINT 6: Webhook - Room changed in Frappe
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

// ✅ ENDPOINT 7: Get devices in a room
exports.getDevicesInRoom = async (req, res) => {
  try {
    const { roomId } = req.query;
    const { skip = 0, limit = 100 } = req.query;

    // Validation
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'roomId is required'
      });
    }

    console.log(`🔍 [Room Devices] Fetching devices for room: ${roomId}`);

    // Fetch devices using DeviceService (accepts both ObjectId and string room names)
    const devices = await DeviceService.getDevicesByRoom(
      roomId,
      {
        skip: parseInt(skip) || 0,
        limit: parseInt(limit) || 100
      }
    );

    // Get total count
    const totalCount = await DeviceService.getDeviceCountByRoom(roomId);

    console.log(`✅ [Room Devices] Found ${devices.length} devices in room ${roomId}`);

    res.status(200).json({
      success: true,
      data: devices,
      pagination: {
        skip: parseInt(skip) || 0,
        limit: parseInt(limit) || 100,
        total: totalCount,
        hasMore: (parseInt(skip) + parseInt(limit)) < totalCount
      },
      message: `Retrieved ${devices.length} devices`
    });
  } catch (error) {
    console.error('❌ [Room Devices] Error in getDevicesInRoom:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch devices',
      data: []
    });
  }
};

