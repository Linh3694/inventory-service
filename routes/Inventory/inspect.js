const express = require('express');
const inspectController = require('../../controllers/Inventory/inspectController');
const validateToken = require('../../middleware/validateToken');
const router = express.Router();
const uploadReport = require('../../middleware/uploadReport');

router.get('/', inspectController.getAllInspections);
router.get('/:id', inspectController.getInspectionById);
router.put('/:id', inspectController.updateInspection);
router.post('/', validateToken, inspectController.createInspection);
router.delete('/:id', inspectController.deleteInspection);
router.get('/latest/:deviceId', inspectController.getLatestInspectionByDeviceId);
router.post('/uploadReport', uploadReport.single('file'), inspectController.uploadReport);
router.get('/downloadReport/:inspectId', inspectController.downloadReport);

module.exports = router;


