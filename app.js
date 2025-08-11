const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: './config.env' });

const db = require('./config/database');
const redis = require('./config/redis');
const User = require('./models/User');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Static files for uploads
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// Simple health route
app.get('/health', async (req, res) => {
  res.json({
    service: 'inventory-service',
    env: process.env.NODE_ENV,
    mongo_connected: db.isConnected(),
    timestamp: new Date().toISOString(),
  });
});

// Inventory routes (protected by user auth or service-to-service token at router level)
app.use('/api/inventory/laptops', require('./routes/Inventory/laptops'));
app.use('/api/inventory/monitors', require('./routes/Inventory/monitors'));
app.use('/api/inventory/printers', require('./routes/Inventory/printers'));
app.use('/api/inventory/projectors', require('./routes/Inventory/projectors'));
app.use('/api/inventory/tools', require('./routes/Inventory/tool'));
app.use('/api/inventory/inspect', require('./routes/Inventory/inspect'));
app.use('/api/inventory/activity', require('./routes/Inventory/activityRoutes'));

// Bootstrap
async function start() {
  const port = Number(process.env.PORT || 4010);
  await db.connect();
  await redis.connect();

  // Subscribe to user events from primary Redis
  const userChannel = process.env.REDIS_USER_CHANNEL || 'user_events';
  await redis.subscribe(userChannel, async (message) => {
    try {
      if (process.env.DEBUG_USER_EVENTS === '1') {
        console.log('[Inventory Service] User event received:', message?.type);
      }
      if (!message || typeof message !== 'object' || !message.type) return;
      const payload = message.user || message.data || null;
      switch (message.type) {
        case 'user_created':
        case 'user_updated':
          if (payload) {
            await User.updateFromFrappe(payload);
          }
          break;
        case 'user_deleted':
          if (process.env.USER_EVENT_DELETE_ENABLED === 'true') {
            const identifier = payload?.email || message.user_id || message.name;
            if (identifier) {
              await User.deleteOne({ $or: [{ email: identifier }, { frappeUserId: identifier }] });
            }
          }
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('[Inventory Service] Failed handling user event:', err.message);
    }
  });

  // Optionally subscribe the same channel on Frappe Redis
  await redis.subscribe(userChannel, async (message) => {
    try {
      if (!message || typeof message !== 'object' || !message.type) return;
      const payload = message.user || message.data || null;
      if (message.type === 'user_created' || message.type === 'user_updated') {
        if (payload) await User.updateFromFrappe(payload);
      }
    } catch (err) {
      console.error('[Inventory Service] (secondary) Failed handling user event:', err.message);
    }
  }, true);

  app.listen(port, () => {
    console.log(`🚀 inventory-service listening on port ${port}`);
  });
}

start().catch((e) => {
  console.error('Failed to start inventory-service:', e);
  process.exit(1);
});


