const express = require('express');
const router = express.Router();
const {
  getPrinters,
  getPrinterById,
  createPrinter,
  updatePrinter,
  deletePrinter,
  updatePrinterSpecs,
  bulkUploadPrinters,
  assignPrinter,
  revokePrinter,
  updatePrinterStatus,
  uploadHandoverReport,
  getHandoverReport,
  getPrinterStatistics,
  getPrinterFilters,
} = require('../../controllers/Inventory/printerController');

const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const { upload, processFile } = require('../../middleware/uploadHandover');

// Public GETs
router.get('/', optionalAuth, getPrinters);
router.get('/filters', optionalAuth, getPrinterFilters);
router.get('/statistics', optionalAuth, getPrinterStatistics);
router.get('/:id', optionalAuth, getPrinterById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', createPrinter);
router.put('/:id', updatePrinter);
router.delete('/:id', deletePrinter);
router.put('/:id/specs', updatePrinterSpecs);
router.post('/bulk-upload', bulkUploadPrinters);
router.post('/upload', upload.single('file'), processFile, uploadHandoverReport);
router.get('/handover/:filename', getHandoverReport);
router.post('/:id/assign', assignPrinter);
router.post('/:id/revoke', revokePrinter);
router.put('/:id/status', updatePrinterStatus);

module.exports = router;


