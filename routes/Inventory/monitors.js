const express = require('express');
const router = express.Router();
const {
  getMonitors,
  getMonitorById,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  updateMonitorSpecs,
  bulkUploadMonitors,
  assignMonitor,
  revokeMonitor,
  updateMonitorStatus,
  uploadHandoverReport,
  getHandoverReport,
} = require('../../controllers/Inventory/monitorController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public GETs
router.get('/', optionalAuth, getMonitors);
router.get('/:id', optionalAuth, getMonitorById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createMonitor);
router.put('/:id', updateMonitor);
router.delete('/:id', deleteMonitor);
router.put('/:id/specs', updateMonitorSpecs);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.post('/bulk-upload', bulkUploadMonitors);
router.post('/:id/assign', assignMonitor);
router.post('/:id/revoke', revokeMonitor);
router.put('/:id/status', updateMonitorStatus);

module.exports = router;


