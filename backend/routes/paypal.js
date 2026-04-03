const express = require('express');
const router = express.Router();
const paypalController = require('../controllers/paypalController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/config', paypalController.getConfig);

// Tạo PayPal order
router.post('/create-order', authenticateToken, paypalController.createOrder);

// Capture PayPal payment
router.post('/capture-order', authenticateToken, paypalController.captureOrder);

// Lấy lịch sử thanh toán PayPal
router.get('/payment-history', authenticateToken, paypalController.getPaymentHistory);

module.exports = router;

