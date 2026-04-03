const express = require('express');
const router = express.Router();
const sessionsController = require('../controllers/sessionsController');

router.get('/rooms', sessionsController.getRoomSessions);
router.post('/rooms', sessionsController.saveRoomSessions);
router.put('/rooms', sessionsController.updateRoomSession);
router.get('/selected-hotel', sessionsController.getSelectedHotel);
router.post('/selected-hotel', sessionsController.saveSelectedHotel);
router.get('/room-total-price', sessionsController.getRoomTotalPrice);
router.post('/room-total-price', sessionsController.saveRoomTotalPrice);
router.get('/checkin-data', sessionsController.getCheckinData);
router.post('/checkin-data', sessionsController.saveCheckinData);
router.get('/room-columns-count', sessionsController.getRoomColumnsCount);
router.post('/room-columns-count', sessionsController.saveRoomColumnsCount);
router.get('/selected-floor', sessionsController.getSelectedFloor);
router.post('/selected-floor', sessionsController.saveSelectedFloor);

module.exports = router;