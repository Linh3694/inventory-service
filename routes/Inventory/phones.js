const express = require('express');
const router = express.Router();
const {
  getPhones,
  getPhoneById,
  createPhone,
  updatePhone,
  deletePhone,
  updatePhoneSpecs,
  assignPhone,
  revokePhone,
  updatePhoneStatus,
} = require('../../controllers/Inventory/phoneController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');

// Public GETs
router.get('/', optionalAuth, getPhones);
router.get('/:id', optionalAuth, getPhoneById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createPhone);
router.put('/:id', updatePhone);
router.delete('/:id', deletePhone);
router.put('/:id/specs', updatePhoneSpecs);
router.post('/:id/assign', assignPhone);
router.post('/:id/revoke', revokePhone);
router.put('/:id/status', updatePhoneStatus);

module.exports = router;


