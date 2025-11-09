const express = require('express');
const router = express.Router();
const {
  getLaptops,
  createLaptop,
  updateLaptop,
  deleteLaptop,
  assignLaptop,
  revokeLaptop,
  updateLaptopStatus,
  bulkUploadLaptops,
  uploadHandoverReport,
  getHandoverReport,
  getLaptopById,
  updateLaptopSpecs,
  fixOldData,
  getLaptopStatistics,
} = require('../../controllers/Inventory/laptopController');

const { authenticate, authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public/optional auth for GET endpoints
router.get('/', optionalAuth, getLaptops);
router.get('/statistics', optionalAuth, getLaptopStatistics);
router.get('/:id', optionalAuth, getLaptopById);

// Protected write endpoints (user or service token)
router.use(authenticateServiceOrUser);
router.post('/', createLaptop);
router.put('/:id', updateLaptop);
router.delete('/:id', deleteLaptop);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.post('/bulk-upload', bulkUploadLaptops);
router.post('/:id/assign', assignLaptop);
router.post('/:id/revoke', revokeLaptop);
router.put('/:id/status', updateLaptopStatus);
router.put('/:id/specs', updateLaptopSpecs);
router.post('/fix-laptops', fixOldData);

module.exports = router;


