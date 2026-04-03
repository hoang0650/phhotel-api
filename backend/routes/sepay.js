const express = require('express');
const router = express.Router();
const sepayController = require('../controllers/sepayController');
const { authenticateToken } = require('../middlewares/auth');

// ============ Legacy Routes (giữ lại để tương thích) ============
// Route đăng nhập SePay (legacy)
router.post('/auth', sepayController.sepayLogin);

// ============ OAuth2 Routes ============
// Tạo authorization URL để redirect user đến SePay
router.get('/oauth2/authorize', authenticateToken, sepayController.getOAuth2AuthorizeUrl);

// Đổi authorization code lấy access token
router.post('/oauth2/token', authenticateToken, sepayController.exchangeOAuth2Token);

// Refresh access token
router.post('/oauth2/refresh', authenticateToken, sepayController.refreshOAuth2Token);

// Lấy thông tin người dùng hiện tại
router.get('/oauth2/me', authenticateToken, sepayController.getOAuth2UserInfo);

// Lấy danh sách tài khoản ngân hàng
router.get('/oauth2/bank-accounts', authenticateToken, sepayController.getOAuth2BankAccounts);

// ============ OAuth2 API Routes ============
// Route lấy danh sách giao dịch từ SePay (sử dụng OAuth2 API)
router.get('/transactions', authenticateToken, sepayController.getSepayTransactions);

// ============ Payment Gateway Routes ============
// Route tạo form thanh toán SePay
router.post('/create-payment', authenticateToken, sepayController.createPayment);

// Route xử lý callback từ SePay (IPN)
router.post('/callback', sepayController.handleCallback);

// Tạo payment history cho SePay (không redirect đến SePay)
router.post('/create-payment-history', authenticateToken, sepayController.createPaymentHistory);

// Lấy QR code thanh toán cho pricing payment (từ superadmin/settings)
router.get('/pricing-qr-code', authenticateToken, sepayController.getPricingQRCode);

// Lấy lịch sử thanh toán SePay từ PaymentHistory
router.get('/payment-history', authenticateToken, sepayController.getPaymentHistory);

router.post('/fpt-tts', authenticateToken, sepayController.generatePaymentSound);
router.get('/fpt-tts-file', authenticateToken, sepayController.fetchTtsFile);

module.exports = router; 
