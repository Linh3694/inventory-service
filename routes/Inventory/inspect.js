const express = require('express');
const inspectController = require('../../controllers/Inventory/inspectController');
const { authenticateServiceOrUser, optionalAuth } = require('../../middleware/validateToken');
const router = express.Router();
const uploadReport = require('../../middleware/uploadReport');

// Public/optional auth for GET endpoints
router.get('/', optionalAuth, inspectController.getAllInspections);
router.get('/latest/:deviceId', optionalAuth, inspectController.getLatestInspectionByDeviceId);
router.get('/downloadReport/:inspectId', optionalAuth, inspectController.downloadReport);
router.get('/:id', optionalAuth, inspectController.getInspectionById);

// Protected writes
router.use(authenticateServiceOrUser);
router.post('/', inspectController.createInspection);
router.put('/:id', inspectController.updateInspection);
router.delete('/:id', inspectController.deleteInspection);
router.post('/uploadReport', uploadReport.single('file'), inspectController.uploadReport);

module.exports = router;


