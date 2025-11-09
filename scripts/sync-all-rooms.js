#!/usr/bin/env node

/**
 * 🏢 Sync Rooms from Frappe to Inventory Service
 * 
 * Syncs all rooms from Frappe to inventory-service Rooms collection.
 * This is a manual sync script that can be run on-demand.
 * 
 * Usage: 
 *   node scripts/sync-all-rooms.js <TOKEN> [BASE_URL]
 * 
 * Example:
 *   node scripts/sync-all-rooms.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *   node scripts/sync-all-rooms.js <TOKEN> https://admin.sis.wellspring.edu.vn
 */

const axios = require('axios');

const args = process.argv.slice(2);
const token = args[0];
const baseURL = args[1] || 'https://admin.sis.wellspring.edu.vn';

if (!token) {
  console.error('❌ Error: Token required');
  console.error('Usage: node scripts/sync-all-rooms.js <TOKEN> [BASE_URL]');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/sync-all-rooms.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  console.error('  node scripts/sync-all-rooms.js <TOKEN> https://admin.sis.wellspring.edu.vn');
  process.exit(1);
}

const syncAllRooms = async () => {
  try {
    const url = `${baseURL}/api/inventory/room/sync/manual`;
    
    console.log('🔄 Starting inventory-service room sync...');
    console.log(`📍 Target: ${baseURL}`);
    console.log('');
    
    const startTime = Date.now();
    const response = await axios.post(url, {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = response.data;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (data.success) {
      console.log('✅ Sync completed successfully!');
      console.log('');
      console.log('📊 Statistics:');
      console.log(`   ✅ Synced:   ${data.stats.synced}`);
      console.log(`   ❌ Failed:   ${data.stats.failed}`);
      console.log(`   📋 Total:    ${data.stats.total}`);
      console.log(`   ⏱️  Duration: ${duration}s`);
      console.log('');
    } else {
      console.error(`❌ Sync failed: ${data.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Sync failed!');
    console.error('');
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data?.message) {
        console.error(`Error: ${error.response.data.message}`);
      }
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
};

syncAllRooms();

