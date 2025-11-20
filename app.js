const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: './config.env' });

const db = require('./config/database');
const redis = require('./config/redis');
const User = require('./models/User');
const redisService = require('./services/redisService');
const Laptop = require('./models/Laptop');
const Monitor = require('./models/Monitor');
const Printer = require('./models/Printer');
const Projector = require('./models/Projector');
const Tool = require('./models/Tool');
const Phone = require('./models/Phone');
const Room = require('./models/Room');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Static files for uploads
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// Simple health route with Redis status
app.get('/health', async (req, res) => {
  const healthStatus = {
    service: 'inventory-service',
    env: process.env.NODE_ENV,
    mongo_connected: db.isConnected(),
    timestamp: new Date().toISOString()
  };

  // Check Redis (optional service)
  try {
    if (redis.isRedisAvailable() && redis.client) {
      await redis.client.ping();
      healthStatus.redis = 'connected';
    } else {
      healthStatus.redis = 'unavailable';
      healthStatus.redis_note = 'Redis is optional, service continues to work without caching';
    }
  } catch (error) {
    healthStatus.redis = 'unavailable';
    healthStatus.redis_note = 'Redis is optional, service continues to work without caching';
    healthStatus.redis_error = error.message;
  }

  // Determine overall status - only MongoDB is critical
  if (!db.isConnected()) {
    healthStatus.status = 'error';
    res.status(503).json(healthStatus);
  } else if (healthStatus.redis === 'unavailable') {
    healthStatus.status = 'degraded';
    res.status(200).json(healthStatus); // Redis unavailable is not a critical error
  } else {
    healthStatus.status = 'ok';
    res.status(200).json(healthStatus);
  }
});

// Inventory routes (protected by user auth or service-to-service token at router level)
app.use('/api/inventory/user', require('./routes/user'));
app.use('/api/inventory/room', require('./routes/room'));
app.use('/api/inventory/laptops', require('./routes/Inventory/laptops'));
app.use('/api/inventory/monitors', require('./routes/Inventory/monitors'));
app.use('/api/inventory/printers', require('./routes/Inventory/printers'));
app.use('/api/inventory/projectors', require('./routes/Inventory/projectors'));
app.use('/api/inventory/phones', require('./routes/Inventory/phones'));
app.use('/api/inventory/tools', require('./routes/Inventory/tool'));
app.use('/api/inventory/inspect', require('./routes/Inventory/inspect'));
app.use('/api/inventory/activity', require('./routes/Inventory/activityRoutes'));

// Additional direct routes for room devices (for frontend compatibility)
const roomController = require('./controllers/roomController');
const { authenticate } = require('./middleware/validateToken');
app.get('/api/inventory/room-devices', authenticate, roomController.getDevicesInRoom);

// Bootstrap
async function start() {
  const port = Number(process.env.PORT || 4010);
  await db.connect();

  // Connect to Redis (optional - service continues if Redis fails)
  try {
    await redis.connect();
  } catch (error) {
    console.warn('⚠️ [Inventory Service] Redis connection failed during startup, continuing without Redis');
  }

  async function syncUserDenormalizedData(userDoc) {
    try {
      if (!userDoc || !userDoc._id) return;
      const fullName = userDoc.fullname || userDoc.fullName || userDoc.name || '';
      const updateCurrentHolder = {
        'currentHolder.fullname': fullName,
        'currentHolder.jobTitle': userDoc.jobTitle || userDoc.designation || '',
        'currentHolder.department': userDoc.department || '',
        'currentHolder.avatarUrl': userDoc.avatarUrl || '',
      };
      const models = [Laptop, Monitor, Printer, Projector, Tool, Phone];
      for (const Model of models) {
        // Update currentHolder
        await Model.updateMany({ 'currentHolder.id': userDoc._id }, { $set: updateCurrentHolder });
        // Update assignmentHistory.userName via arrayFilters
        await Model.updateMany(
          { 'assignmentHistory.user': userDoc._id },
          { $set: { 'assignmentHistory.$[elem].userName': fullName } },
          { arrayFilters: [{ 'elem.user': userDoc._id }] }
        );
      }
    } catch (e) {
      console.warn('[Inventory Service] syncUserDenormalizedData warning:', e.message);
    }
  }

  // Subscribe to user events from primary Redis (only if Redis is available)
  const userChannel = process.env.REDIS_USER_CHANNEL || 'user_events';
  const roomChannel = process.env.REDIS_ROOM_CHANNEL || 'room_events';

  if (redis.isRedisAvailable()) {
    console.log(`[Inventory Service] Subscribing to Redis channel: ${userChannel}`);
    console.log(`[Inventory Service] Subscribing to Redis room channel: ${roomChannel}`);

    await redis.subscribe(userChannel, async (message) => {
    try {
      // Always log user events for debugging
      console.log('[Inventory Service] User event received:', message?.type, 'from:', message?.source);
      if (!message || typeof message !== 'object' || !message.type) return;
      const payload = message.user || message.data || null;
      switch (message.type) {
        case 'user_created':
        case 'user_updated':
          if (payload) {
            console.log('[Inventory Service] Processing user:', payload.email);
            try {
              const updated = await User.updateFromFrappe(payload);
              console.log('[Inventory Service] User updated in DB:', updated.email);
              await syncUserDenormalizedData(updated);
              console.log('[Inventory Service] Denormalized data synced');
              await redisService.deleteAllDeviceCache();
              console.log('[Inventory Service] Cache cleared');
            } catch (dbError) {
              console.error('[Inventory Service] DB update error:', dbError.message);
            }
          }
          break;
        case 'user_deleted':
          if (process.env.USER_EVENT_DELETE_ENABLED === 'true') {
            const identifier = payload?.email || message.user_id || message.name;
            if (identifier) {
              await User.deleteOne({ $or: [{ email: identifier }, { frappeUserId: identifier }] });
              await redisService.deleteAllDeviceCache();
            }
          }
          break;
        // Note: Room events are handled in the separate room channel subscription below
        default:
          break;
      }
    } catch (err) {
      console.error('[Inventory Service] Failed handling user event:', err.message);
      }
    });

    // Subscribe to room events
    await redis.subscribe(roomChannel, async (message) => {
    try {
      console.log('[Inventory Service] Room event received:', message?.type, 'from:', message?.source);
      if (!message || typeof message !== 'object' || !message.type) return;

      const payload = message.room || message.data || null;

      switch (message.type) {
        case 'room_created':
        case 'room_updated':
          if (payload) {
            console.log('[Inventory Service] Processing room:', payload.name || payload.room_name);
            try {
              const room = await Room.syncFromFrappe(payload);
              console.log('[Inventory Service] Room synced:', room.name);
              await redisService.deleteAllDeviceCache(); // Clear cache vì room data changed
            } catch (dbError) {
              console.error('[Inventory Service] Room sync error:', dbError.message);
            }
          }
          break;
        case 'room_deleted':
          if (payload) {
            const roomId = payload.name || payload.room_id;
            if (roomId) {
              console.log('[Inventory Service] Deleting room:', roomId);
              await Room.deleteOne({ frappeRoomId: roomId });
              await redisService.deleteAllDeviceCache();
            }
          }
          break;
        case 'room_events_ping':
          console.log('[Inventory Service] Room events ping received');
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('[Inventory Service] Failed handling room event:', err.message);
    }
  });

  // Optionally subscribe the same channel on Frappe Redis
  await redis.subscribe(userChannel, async (message) => {
    try {
      if (!message || typeof message !== 'object' || !message.type) return;
      const payload = message.user || message.data || null;
      if (message.type === 'user_created' || message.type === 'user_updated') {
        if (payload) {
          const updated = await User.updateFromFrappe(payload);
          await syncUserDenormalizedData(updated);
          await redisService.deleteAllDeviceCache();
        }
      }
    } catch (err) {
      console.error('[Inventory Service] (secondary) Failed handling user event:', err.message);
    }
  }, true);
  } else {
    console.log('[Inventory Service] Redis not available, skipping Redis subscriptions');
  }

  app.listen(port, () => {
    console.log(`🚀 inventory-service listening on port ${port}`);
  });
}

start().catch((e) => {
  console.error('Failed to start inventory-service:', e);
  process.exit(1);
});


