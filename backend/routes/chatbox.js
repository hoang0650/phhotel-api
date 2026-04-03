var express = require('express');
var router = express.Router();
const { createMessage, getMessages } = require('../controllers/chatbox');

/**
 * @swagger
 * /chatboxes/messages:
 *   post:
 *     summary: Tạo một tin nhắn mới
 *     description: Tạo và lưu một tin nhắn mới vào cơ sở dữ liệu. Tin nhắn có thể là từ người dùng hoặc từ bot.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Nội dung tin nhắn
 *               isBotMessage:
 *                 type: boolean
 *                 description: Chỉ định xem tin nhắn có phải từ bot hay không
 *             required:
 *               - message
 *     responses:
 *       201:
 *         description: Tin nhắn đã được tạo thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: ID của tin nhắn mới tạo
 *                 message:
 *                   type: string
 *                   description: Nội dung tin nhắn
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: Thời gian gửi tin nhắn
 *                 isBotMessage:
 *                   type: boolean
 *                   description: Chỉ định xem tin nhắn có phải từ bot hay không
 *       400:
 *         description: Lỗi không hợp lệ
 */
router.post('/messages', createMessage);
/**
 * @swagger
 * /chatboxes/messages:
 *   get:
 *     summary: Lấy tất cả tin nhắn
 *     description: Trả về danh sách tất cả các tin nhắn từ cơ sở dữ liệu, bao gồm các tin nhắn từ người dùng và bot.
 *     responses:
 *       200:
 *         description: Danh sách các tin nhắn
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: ID của tin nhắn
 *                   message:
 *                     type: string
 *                     description: Nội dung tin nhắn
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     description: Thời gian gửi tin nhắn
 *                   isBotMessage:
 *                     type: boolean
 *                     description: Chỉ định xem tin nhắn có phải từ bot hay không
 *       400:
 *         description: Lỗi không hợp lệ
 */
router.get('/messages', getMessages);

module.exports = router;
