const express = require('express');
const router = express.Router();
const activityController = require('../../controllers/Inventory/activityController');

router.get('/:entityType/:entityId', activityController.getActivities);
router.post('/', activityController.addActivity);
router.put('/:id', activityController.updateActivity);
router.delete('/:id', activityController.deleteActivity);

module.exports = router;


