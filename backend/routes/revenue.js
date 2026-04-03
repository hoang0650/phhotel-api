const express = require('express');
const router = express.Router();
const revenueController = require('../controllers/revenue');
const { authenticateToken } = require('../middlewares/auth');

// Apply auth middleware
router.use(authenticateToken);

router.get('/summary', revenueController.getSummary);
router.get('/daily', revenueController.getDaily);
router.get('/monthly', revenueController.getMonthly);
router.get('/date-range', revenueController.getRevenueByRange);
router.get('/hotel/:hotelId/summary', revenueController.getSummary);

module.exports = router;
