const express = require('express');
const userController = require('../controllers/userController');

const router = express.Router();

// 📋 GET all users for assignment (with optional search/filter)
router.get('/', userController.getAllUsers);

// 📝 ENDPOINT 1: Manual sync all users (UNAUTHENTICATED - secured via token in Frappe)
router.post('/sync/manual', userController.syncUsersManual);

// 🔍 ENDPOINT 2: Test fetch users (UNAUTHENTICATED)
router.get('/debug/fetch-users', userController.debugFetchUsers);

// 📧 ENDPOINT 3: Sync user by email (UNAUTHENTICATED)
router.post('/sync/email/:email', userController.syncUserByEmail);

// 🔔 ENDPOINT 4: Webhook - User changed in Frappe (NO AUTH)
router.post('/webhook/frappe-user-changed', userController.webhookUserChanged);

module.exports = router;

