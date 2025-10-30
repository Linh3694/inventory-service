const redis = require('./config/redis');

// Test script to manually publish room events to Redis using existing config
async function testRedisPublish() {
  const roomChannel = process.env.REDIS_ROOM_CHANNEL || 'room_events';

  console.log(`🔧 Testing Redis publish to channel: ${roomChannel}`);

  try {
    await redis.connect();
    console.log('✅ Connected to Redis');

    // Test room created event
    const roomCreatedMessage = {
      type: 'room_created',
      room: {
        name: 'TEST_ROOM_001',
        room_name: 'Test Room 001',
        room_number: '001',
        building: 'Test Building',
        floor: '1',
        capacity: 30,
        room_type: 'Classroom',
        status: 'Active',
        disabled: false
      },
      source: 'test_script',
      timestamp: new Date().toISOString()
    };

    await redis.publish(roomChannel, roomCreatedMessage);
    console.log('📡 Published room_created event');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test room updated event
    const roomUpdatedMessage = {
      type: 'room_updated',
      room: {
        name: 'TEST_ROOM_001',
        room_name: 'Test Room 001 Updated',
        room_number: '001',
        building: 'Test Building',
        floor: '1',
        capacity: 35, // Changed capacity
        room_type: 'Classroom',
        status: 'Active',
        disabled: false
      },
      source: 'test_script',
      timestamp: new Date().toISOString()
    };

    await redis.publish(roomChannel, roomUpdatedMessage);
    console.log('📡 Published room_updated event');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test ping
    const pingMessage = {
      type: 'room_events_ping',
      source: 'test_script',
      timestamp: new Date().toISOString()
    };

    await redis.publish(roomChannel, pingMessage);
    console.log('📡 Published room_events_ping');

    console.log('✅ All test events published successfully');
    console.log('🔍 Check inventory service logs for received events');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRedisPublish();
