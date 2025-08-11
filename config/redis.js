const { createClient } = require('redis');
require('dotenv').config({ path: './config.env' });

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.userSubClient = null;
    this.secondarySubClient = null; // optional Frappe Redis
  }

  async connect() {
    const url = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    const baseOpts = url ? { url } : { socket: { host, port }, password };

    try {
      this.client = createClient(baseOpts);
      this.pubClient = createClient(baseOpts);
      this.userSubClient = createClient(baseOpts);

      this.client.on('error', (e) => console.error('[Inventory Service] Redis client error:', e.message));
      this.pubClient.on('error', (e) => console.error('[Inventory Service] Redis pub error:', e.message));
      this.userSubClient.on('error', (e) => console.error('[Inventory Service] Redis user-sub error:', e.message));

      await this.client.connect();
      await this.pubClient.connect();
      await this.userSubClient.connect();

      console.log('✅ [Inventory Service] Redis connected');

      // optional second subscriber connected to Frappe Redis
      const frappeUrl = process.env.FRAPPE_REDIS_URL || process.env.FRAPPE_REDIS_SOCKETIO;
      const frappeHost = process.env.FRAPPE_REDIS_HOST;
      const frappePort = process.env.FRAPPE_REDIS_PORT ? Number(process.env.FRAPPE_REDIS_PORT) : undefined;
      const frappePassword = process.env.FRAPPE_REDIS_PASSWORD || undefined;
      const frappeDb = process.env.FRAPPE_REDIS_DB ? Number(process.env.FRAPPE_REDIS_DB) : undefined;
      if (frappeUrl || frappeHost) {
        try {
          const secondaryOpts = frappeUrl ? { url: frappeUrl } : { socket: { host: frappeHost || '127.0.0.1', port: frappePort || 13000 }, password: frappePassword, database: frappeDb };
          this.secondarySubClient = createClient(secondaryOpts);
          this.secondarySubClient.on('error', (e) => console.error('[Inventory Service] Redis secondary-sub error:', e.message));
          await this.secondarySubClient.connect();
          console.log('[Inventory Service] Connected secondary subscriber to Frappe Redis');
        } catch (secErr) {
          console.warn('⚠️ [Inventory Service] Could not connect secondary subscriber:', secErr.message);
        }
      }
    } catch (error) {
      console.error('❌ [Inventory Service] Redis connection failed:', error.message);
      throw error;
    }
  }

  async publish(channel, message) {
    const payload = typeof message === 'object' ? JSON.stringify(message) : message;
    await this.pubClient.publish(channel, payload);
  }

  async subscribe(channel, callback, useSecondary = false) {
    const sub = useSecondary && this.secondarySubClient ? this.secondarySubClient : this.userSubClient;
    await sub.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        callback(parsed);
      } catch {
        callback(message);
      }
    });
  }

  async get(key) {
    const value = await this.client.get(key);
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  }

  async set(key, value, ttl = null) {
    const val = typeof value === 'object' ? JSON.stringify(value) : value;
    if (ttl) return this.client.setEx(key, ttl, val);
    return this.client.set(key, val);
  }

  async del(key) {
    return this.client.del(key);
  }
}

module.exports = new RedisClient();


