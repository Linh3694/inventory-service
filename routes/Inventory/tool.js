const express = require('express');
const router = express.Router();
const {
  getTools,
  createTool,
  updateTool,
  deleteTool,
  bulkUploadTools,
  assignTool,
  revokeTool,
  updateToolStatus,
  uploadHandoverReport,
  getHandoverReport,
  getToolById,
  updateToolSpecs,
  getToolStatistics,
  getToolFilters,
} = require('../../controllers/Inventory/toolController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public GETs
router.get('/', optionalAuth, getTools);
router.get('/filters', optionalAuth, getToolFilters);
router.get('/statistics', optionalAuth, getToolStatistics);
router.get('/:id', optionalAuth, getToolById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createTool);
router.put('/:id', updateTool);
router.delete('/:id', deleteTool);
router.put('/:id/specs', updateToolSpecs);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.post('/bulk-upload', bulkUploadTools);
router.post('/:id/assign', assignTool);
router.post('/:id/revoke', revokeTool);
router.put('/:id/status', updateToolStatus);

module.exports = router;


