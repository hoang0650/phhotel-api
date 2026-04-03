var express = require('express');
var router = express.Router();
const { chatWithAI, getChatHistory, deleteChatHistory } = require('../controllers/aiAssistantController');
const { authenticateToken } = require('../middlewares/auth');

/**
 * @swagger
 * /ai-assistant/chat:
 *   post:
 *     summary: Chat với AI Assistant
 *     description: Gửi câu hỏi đến AI Assistant và nhận phản hồi dựa trên quyền và phạm vi dữ liệu của user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Nội dung câu hỏi
 *               fileUrl:
 *                 type: string
 *                 description: URL của file đính kèm (nếu có)
 *               fileType:
 *                 type: string
 *                 description: Loại file (nếu có)
 *             required:
 *               - message
 *     responses:
 *       200:
 *         description: Phản hồi từ AI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: string
 *                   description: Phản hồi từ AI
 *                 context:
 *                   type: object
 *                   properties:
 *                     dataScope:
 *                       type: string
 *                     summary:
 *                       type: string
 *       400:
 *         description: Lỗi validation
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.post('/chat', authenticateToken, chatWithAI);

/**
 * @swagger
 * /ai-assistant/history:
 *   get:
 *     summary: Lấy lịch sử chat
 *     description: Lấy lịch sử các cuộc trò chuyện với AI Assistant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách tin nhắn trong lịch sử
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.get('/history', authenticateToken, getChatHistory);

/**
 * @swagger
 * /ai-assistant/history:
 *   delete:
 *     summary: Xóa lịch sử chat
 *     description: Xóa toàn bộ lịch sử trò chuyện với AI Assistant
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Đã xóa lịch sử thành công
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi server
 */
router.delete('/history', authenticateToken, deleteChatHistory);

module.exports = router;

