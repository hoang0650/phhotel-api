var express = require('express');
var router = express.Router();
const {sendMessage, getMessages, getGroup, createGroup }  = require('../controllers/chats'); // Thay đổi đường dẫn tới controller của bạn

// Load OTP endpoint (for demonstration, usually OTP is stored in a database)
router.get('/private', sendMessage);
// Get group message
router.get('/private/:userId',getMessages);
// Create group
router.post('/group', createGroup);
// Get group
router.get('/group/:groupId', getGroup);

module.exports = router;

