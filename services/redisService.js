const redis = require('../config/redis');

class InventoryRedisService {
  async setDevicePage(deviceType, page, limit, devices, total, expirationInSeconds = 300) {
    const key = `devices:${deviceType}:page:${page}:limit:${limit}`;
    const data = { devices, total, page, limit, cached_at: Date.now() };
    await redis.set(key, data, expirationInSeconds);
    return { success: true };
  }

  async getDevicePage(deviceType, page, limit) {
    const key = `devices:${deviceType}:page:${page}:limit:${limit}`;
    return await redis.get(key);
  }

  async deleteDeviceCache(deviceType) {
    const pattern = `devices:${deviceType}:*`;
    if (!redis.client) return;
    const keys = await redis.client.keys(pattern);
    if (keys.length > 0) await redis.client.del(keys);
  }

  async deleteAllDeviceCache() {
    const pattern = 'devices:*';
    if (!redis.client) return;
    const keys = await redis.client.keys(pattern);
    if (keys.length > 0) await redis.client.del(keys);
  }
}

module.exports = new InventoryRedisService();


