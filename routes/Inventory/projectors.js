const express = require('express');
const router = express.Router();
const {
  getProjectors,
  createProjector,
  updateProjector,
  deleteProjector,
  bulkUploadProjectors,
  assignProjector,
  revokeProjector,
  updateProjectorStatus,
  uploadHandoverReport,
  getHandoverReport,
  getProjectorById,
  updateProjectorSpecs,
} = require('../../controllers/Inventory/projectorController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public GETs
router.get('/', optionalAuth, getProjectors);
router.get('/:id', optionalAuth, getProjectorById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createProjector);
router.put('/:id', updateProjector);
router.delete('/:id', deleteProjector);
router.put('/:id/specs', updateProjectorSpecs);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.post('/bulk-upload', bulkUploadProjectors);
router.post('/:id/assign', assignProjector);
router.post('/:id/revoke', revokeProjector);
router.put('/:id/status', updateProjectorStatus);

module.exports = router;


