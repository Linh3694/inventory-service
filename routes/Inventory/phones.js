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
  getPhoneStatistics,
  getPhoneFilters,
  uploadHandoverReport,
  getHandoverReport,
} = require('../../controllers/Inventory/phoneController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public GETs
router.get('/', optionalAuth, getPhones);
router.get('/filters', optionalAuth, getPhoneFilters);
router.get('/statistics', optionalAuth, getPhoneStatistics);
router.get('/:id', optionalAuth, getPhoneById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createPhone);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.put('/:id', updatePhone);
router.delete('/:id', deletePhone);
router.put('/:id/specs', updatePhoneSpecs);
router.post('/:id/assign', assignPhone);
router.post('/:id/revoke', revokePhone);
router.put('/:id/status', updatePhoneStatus);

module.exports = router;


