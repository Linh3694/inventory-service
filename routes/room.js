const express = require('express');
const roomController = require('../controllers/roomController');

const router = express.Router();

// 📝 ENDPOINT 1: Manual sync all rooms (UNAUTHENTICATED - secured via token in Frappe)
router.post('/sync/manual', roomController.syncRoomsManual);

// 🔍 ENDPOINT 2: Test fetch rooms (UNAUTHENTICATED)
router.get('/debug/fetch-rooms', roomController.debugFetchRooms);

// 🏢 ENDPOINT 3: Sync room by ID (UNAUTHENTICATED)
router.post('/sync/id/:roomId', roomController.syncRoomById);

// 🔔 ENDPOINT 4: Webhook - Room changed in Frappe (NO AUTH)
router.post('/webhook/frappe-room-changed', roomController.webhookRoomChanged);

module.exports = router;

