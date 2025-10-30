const redis = require('./config/redis');

async function testRoomEvents() {
  console.log('🔧 Testing Redis room events subscription...');

  try {
    // Connect to Redis
    await redis.connect();
    console.log('✅ Connected to Redis');

    // Subscribe to room events channel
    const roomChannel = process.env.REDIS_ROOM_CHANNEL || 'room_events';
    console.log(`📡 Subscribing to channel: ${roomChannel}`);

    await redis.subscribe(roomChannel, (message) => {
      console.log('📨 Room event received:', JSON.stringify(message, null, 2));
    });

    console.log('🎧 Listening for room events... Press Ctrl+C to stop');

    // Keep the process running
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping room events test...');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testRoomEvents();
