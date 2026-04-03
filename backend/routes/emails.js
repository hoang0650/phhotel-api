var express = require('express');
var router = express.Router();
const {sendEmail,sendOtp,loadOtp, }  = require('../controllers/email'); // Thay đổi đường dẫn tới controller của bạn

// Send email endpoint
router.post('/send-email', sendEmail);

// Generate OTP and send endpoint
router.post('/send-otp', sendOtp);

// Load OTP endpoint (for demonstration, usually OTP is stored in a database)
router.get('/load-otp', loadOtp);


module.exports = router;
