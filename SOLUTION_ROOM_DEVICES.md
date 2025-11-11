# Giải Pháp: Endpoint Lấy Danh Sách Thiết Bị của Phòng

## 1. Phân Tích Yêu Cầu

### 1.1 Mục Tiêu
Cung cấp endpoint REST API để lấy danh sách tất cả thiết bị (laptop, monitor, printer, etc.) đã được gán cho một phòng cụ thể.

### 1.2 Sử Dụng
- **Frontend**: Hiển thị tab "Thiết bị" trong chi tiết phòng
- **Endpoint**: `GET /api/inventory/room-devices?roomId={roomId}`
- **Authorization**: Token-based (Bearer token)
- **Response Format**: JSON với pagination (nếu cần)

### 1.3 Dữ Liệu Hiện Tại
- **Laptop Collection**: Chứa field `room` (MongoDB ObjectId hoặc string ID)
- **Monitor Collection**: Tương tự
- **Printer Collection**: Tương tự
- **Projector Collection**: Tương tự
- **Phone Collection**: Tương tự
- **Tool Collection**: Tương tự

## 2. Kiến Trúc Giải Pháp

### 2.1 Cấu Trúc Thư Mục
```
inventory-service/
├── routes/
│   └── room.js                    # Thêm route mới
├── controllers/
│   └── roomController.js          # Thêm method getDevicesInRoom
├── models/
│   ├── Laptop.js
│   ├── Monitor.js
│   ├── Printer.js
│   ├── Projector.js
│   ├── Phone.js
│   └── Tool.js
├── utils/
│   └── errorHandler.js            # Sử dụng existing
└── services/
    └── deviceService.js           # [NEW] Centralise logic
```

### 2.2 Flow Xử Lý
```
Client Request
    ↓
Nginx (proxy)
    ↓
Express Middleware (auth, validation)
    ↓
roomController.getDevicesInRoom()
    ↓
deviceService.getDevicesByRoom()
    ↓
Query Multiple Collections (Laptop, Monitor, etc.)
    ↓
Aggregate Results
    ↓
Format Response
    ↓
Send to Client
```

## 3. Chi Tiết Triển Khai

### 3.1 Model Thay Đổi (Không Cần - Đã Có)
Các model hiện tại đã có field `room`, không cần thay đổi:

```javascript
// Laptop.js (existing)
{
  _id: ObjectId,
  name: String,
  serial: String,
  room: ObjectId,  // ← Reference to Room
  status: String,
  assigned: [{fullname: String}],
  manufacturer: String,
  type: String
}
```

### 3.2 Service Layer (NEW)
**File**: `services/deviceService.js`

```javascript
const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

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

      // Query tất cả collections
      for (const [type, Model] of Object.entries(this.DEVICE_MODELS)) {
        try {
          const items = await Model.find({ room: roomId })
            .skip(skip)
            .limit(limit)
            .sort(sort)
            .select('_id name serial status type manufacturer assigned createdAt updatedAt')
            .lean();

          devices.push(...items);
        } catch (error) {
          console.warn(`⚠️ Error querying ${type}:`, error.message);
          // Continue with other collections if one fails
        }
      }

      // Sort combined results by createdAt descending
      devices.sort((a, b) => 
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );

      return devices;
    } catch (error) {
      console.error('❌ Error in getDevicesByRoom:', error);
      throw new Error(`Failed to fetch devices: ${error.message}`);
    }
  }

  /**
   * Lấy số lượng thiết bị của phòng
   */
  static async getDeviceCountByRoom(roomId) {
    try {
      let totalCount = 0;

      for (const Model of Object.values(this.DEVICE_MODELS)) {
        try {
          const count = await Model.countDocuments({ room: roomId });
          totalCount += count;
        } catch (error) {
          console.warn(`⚠️ Error counting in model:`, error.message);
        }
      }

      return totalCount;
    } catch (error) {
      console.error('❌ Error in getDeviceCountByRoom:', error);
      throw error;
    }
  }

  /**
   * Lấy thiết bị của phòng theo loại
   */
  static async getDevicesByRoomAndType(roomId, type) {
    const Model = this.DEVICE_MODELS[type.toLowerCase()];
    if (!Model) {
      throw new Error(`Invalid device type: ${type}`);
    }

    return await Model.find({ room: roomId })
      .select('_id name serial status type manufacturer assigned createdAt')
      .lean();
  }
}

module.exports = DeviceService;
```

### 3.3 Controller Method (ADD TO roomController.js)
```javascript
const DeviceService = require('../services/deviceService');

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

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid roomId format'
      });
    }

    console.log(`🔍 Fetching devices for room: ${roomId}`);

    // Fetch devices
    const devices = await DeviceService.getDevicesByRoom(
      roomId,
      {
        skip: parseInt(skip),
        limit: parseInt(limit)
      }
    );

    // Get total count
    const totalCount = await DeviceService.getDeviceCountByRoom(roomId);

    console.log(`✅ Found ${devices.length} devices in room ${roomId}`);

    res.status(200).json({
      success: true,
      data: devices,
      pagination: {
        skip: parseInt(skip),
        limit: parseInt(limit),
        total: totalCount,
        hasMore: (parseInt(skip) + parseInt(limit)) < totalCount
      },
      message: `Retrieved ${devices.length} devices`
    });
  } catch (error) {
    console.error('❌ Error in getDevicesInRoom:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch devices'
    });
  }
};
```

### 3.4 Route (ADD TO room.js)
```javascript
const router = require('express').Router();
const roomController = require('../controllers/roomController');
const authMiddleware = require('../middleware/authMiddleware');

// ... existing routes ...

/**
 * GET /api/inventory/room-devices
 * Lấy danh sách thiết bị của một phòng
 * @query roomId {string} - MongoDB ObjectId của phòng
 * @query skip {number} - Pagination skip (default: 0)
 * @query limit {number} - Pagination limit (default: 100)
 */
router.get('/room-devices', authMiddleware, roomController.getDevicesInRoom);

module.exports = router;
```

## 4. Response Format

### 4.1 Success Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Dell Latitude 5000",
      "serial": "DELL-SN-123456",
      "type": "laptop",
      "status": "Active",
      "manufacturer": "Dell",
      "assigned": [
        {
          "fullname": "Nguyễn Văn A"
        }
      ],
      "createdAt": "2025-11-10T10:30:00Z",
      "updatedAt": "2025-11-11T14:20:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "LG 27\" Monitor",
      "serial": "LG-MN-789012",
      "type": "monitor",
      "status": "Broken",
      "manufacturer": "LG",
      "assigned": [],
      "createdAt": "2025-11-08T09:15:00Z",
      "updatedAt": "2025-11-11T11:00:00Z"
    }
  ],
  "pagination": {
    "skip": 0,
    "limit": 100,
    "total": 25,
    "hasMore": false
  },
  "message": "Retrieved 25 devices"
}
```

### 4.2 Error Response (400/500)
```json
{
  "success": false,
  "message": "roomId is required"
}
```

## 5. Testing Plan

### 5.1 Manual Testing
```bash
# Test 1: Get devices for valid room
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/inventory/room-devices?roomId=507f1f77bcf86cd799439011"

# Test 2: Get devices with pagination
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/inventory/room-devices?roomId=507f1f77bcf86cd799439011&skip=0&limit=10"

# Test 3: Missing roomId (should fail)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/inventory/room-devices"

# Test 4: Invalid roomId format (should fail)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5001/api/inventory/room-devices?roomId=invalid"
```

### 5.2 Unit Tests (Suggested)
```javascript
// tests/deviceService.test.js
describe('DeviceService', () => {
  describe('getDevicesByRoom', () => {
    it('should return all devices for a room', async () => {
      // Mock test
    });

    it('should handle non-existent room', async () => {
      // Mock test
    });

    it('should respect pagination', async () => {
      // Mock test
    });
  });
});
```

## 6. Cân Nhắc Performance

### 6.1 Optimization
- ✅ Sử dụng `.lean()` cho read-only queries
- ✅ Chỉ select fields cần thiết
- ✅ Pagination để giới hạn dữ liệu
- ✅ Parallel queries (Promise.all) nếu cần

### 6.2 Cải Tiến Tương Lai
1. **Database Index**: Thêm index trên `room` field trong tất cả collections
   ```javascript
   Model.collection.createIndex({ room: 1 });
   ```

2. **Caching**: Redis cache cho devices by room (TTL 5-10 phút)

3. **Aggregation Pipeline**: Nếu số lượng devices lớn, sử dụng MongoDB aggregation

## 7. Lộ Trình Triển Khai

### Phase 1: Development
- [ ] Tạo `deviceService.js`
- [ ] Thêm method `getDevicesInRoom` vào `roomController.js`
- [ ] Thêm route `/room-devices`
- [ ] Local testing

### Phase 2: Testing
- [ ] Manual curl testing
- [ ] Integration tests
- [ ] Load testing (nếu nhiều devices)

### Phase 3: Deployment
- [ ] Push code
- [ ] Update PM2 ecosystem
- [ ] Restart service
- [ ] Monitor logs

## 8. Lưu Ý Quan Trọng

### 8.1 Bảo Mật
- ✅ Require authentication token
- ✅ Validate roomId format
- ✅ Không expose sensitive fields

### 8.2 Error Handling
- ✅ Graceful fallback nếu một collection fail
- ✅ Detailed error messages
- ✅ Proper HTTP status codes

### 8.3 Logging
- ✅ Debug log khi fetch
- ✅ Warn log nếu collection query fail
- ✅ Error log khi có exception

---

**Trạng Thái**: Ready for Implementation
**Ước Tính Thời Gian**: 2-3 giờ (code + test + deploy)

