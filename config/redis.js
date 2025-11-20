const { createClient } = require('redis');
require('dotenv').config({ path: './config.env' });

class RedisClient {
  constructor() {
    this.client = null;
    this.pubClient = null;
    this.userSubClient = null;
    this.secondarySubClient = null; // optional Frappe Redis
    this.isConnected = false;
    this.isConnecting = false;
  }

  async connect() {
    if (this.isConnecting) {
      console.log('[Inventory Service] Redis connection already in progress');
      return;
    }

    this.isConnecting = true;

    const url = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    const baseOpts = url ? { url } : { socket: { host, port }, password };

    try {
      this.client = createClient(baseOpts);
      this.pubClient = createClient(baseOpts);
      this.userSubClient = createClient(baseOpts);

      this.client.on('error', (e) => {
        console.error('[Inventory Service] Redis client error:', e.message);
        this.isConnected = false;
      });
      this.pubClient.on('error', (e) => {
        console.error('[Inventory Service] Redis pub error:', e.message);
        this.isConnected = false;
      });
      this.userSubClient.on('error', (e) => {
        console.error('[Inventory Service] Redis user-sub error:', e.message);
        this.isConnected = false;
      });

      this.client.on('ready', () => {
        console.log('[Inventory Service] Redis client ready');
        this.isConnected = true;
      });
      this.pubClient.on('ready', () => {
        console.log('[Inventory Service] Redis pub ready');
        this.isConnected = true;
      });
      this.userSubClient.on('ready', () => {
        console.log('[Inventory Service] Redis user-sub ready');
        this.isConnected = true;
      });

      await this.client.connect();
      await this.pubClient.connect();
      await this.userSubClient.connect();

      console.log('✅ [Inventory Service] Redis connected');
      this.isConnected = true;

      // optional second subscriber connected to Frappe Redis
      const frappeUrl = process.env.FRAPPE_REDIS_URL || process.env.FRAPPE_REDIS_SOCKETIO;
      const frappeHost = process.env.FRAPPE_REDIS_HOST;
      const frappePort = process.env.FRAPPE_REDIS_PORT ? Number(process.env.FRAPPE_REDIS_PORT) : undefined;
      const frappePassword = process.env.FRAPPE_REDIS_PASSWORD || undefined;
      const frappeDb = process.env.FRAPPE_REDIS_DB ? Number(process.env.FRAPPE_REDIS_DB) : undefined;
      if (frappeUrl || frappeHost) {
        try {
          const secondaryOpts = frappeUrl
            ? { url: frappeUrl }
            : {
                socket: { host: frappeHost || '127.0.0.1', port: frappePort || 13001 },
                password: frappePassword,
                database: frappeDb,
              };
          this.secondarySubClient = createClient(secondaryOpts);
          this.secondarySubClient.on('error', (e) => console.error('[Inventory Service] Redis secondary-sub error:', e.message));
          await this.secondarySubClient.connect();
          console.log('[Inventory Service] Connected secondary subscriber to Frappe Redis');
        } catch (secErr) {
          console.warn('⚠️ [Inventory Service] Could not connect secondary subscriber:', secErr.message);
        }
      }
    } catch (error) {
      console.warn('⚠️ [Inventory Service] Redis connection failed, service will continue without Redis:', error.message);
      this.isConnected = false;
      // Don't throw error - Redis is optional
    } finally {
      this.isConnecting = false;
    }
  }

  async publish(channel, message) {
    if (!this.isConnected || !this.pubClient) {
      console.warn('[Inventory Service] Redis not available, skipping publish operation');
      return;
    }

    try {
      const payload = typeof message === 'object' ? JSON.stringify(message) : message;
      await this.pubClient.publish(channel, payload);
    } catch (error) {
      console.warn('[Inventory Service] Redis publish operation failed:', error.message);
    }
  }

  async subscribe(channel, callback, useSecondary = false) {
    const sub = useSecondary && this.secondarySubClient ? this.secondarySubClient : this.userSubClient;
    if (!this.isConnected || !sub) {
      console.warn('[Inventory Service] Redis not available, skipping subscribe operation');
      return;
    }

    try {
      await sub.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch {
          callback(message);
        }
      });
    } catch (error) {
      console.warn('[Inventory Service] Redis subscribe operation failed:', error.message);
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) {
      console.warn('[Inventory Service] Redis not available, skipping get operation');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;
      try { return JSON.parse(value); } catch { return value; }
    } catch (error) {
      console.warn('[Inventory Service] Redis get operation failed:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    if (!this.isConnected || !this.client) {
      console.warn('[Inventory Service] Redis not available, skipping set operation');
      return;
    }

    try {
      const val = typeof value === 'object' ? JSON.stringify(value) : value;
      if (ttl) return this.client.setEx(key, ttl, val);
      return this.client.set(key, val);
    } catch (error) {
      console.warn('[Inventory Service] Redis set operation failed:', error.message);
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) {
      console.warn('[Inventory Service] Redis not available, skipping del operation');
      return;
    }

    try {
      return this.client.del(key);
    } catch (error) {
      console.warn('[Inventory Service] Redis del operation failed:', error.message);
    }
  }

  // Check if Redis is available
  isRedisAvailable() {
    return this.isConnected;
  }
}

module.exports = new RedisClient();


