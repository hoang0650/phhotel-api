const express = require('express');
const router = express.Router();
const cryptoController = require('../controllers/cryptoController');
const { authenticateToken } = require('../middlewares/auth');

// Tạo thanh toán crypto
router.post('/create-payment', authenticateToken, cryptoController.createPayment);

// Xác nhận thanh toán crypto (user)
router.post('/verify-payment', authenticateToken, cryptoController.verifyPayment);

// Xác nhận thanh toán crypto (admin)
router.post('/confirm-payment', authenticateToken, cryptoController.confirmPayment);

// Lấy lịch sử thanh toán crypto
router.get('/payment-history', authenticateToken, cryptoController.getPaymentHistory);

// Webhook để nhận thông báo từ blockchain monitoring
router.post('/webhook', cryptoController.handleWebhook);

module.exports = router;

