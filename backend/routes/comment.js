const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { authenticateToken } = require('../middlewares/auth');

// ============ PUBLIC ROUTES (KHÔNG CẦN AUTHENTICATION) ============
// GET /comments/blog/:blogId - Lấy danh sách comment của blog (public)
router.get('/blog/:blogId', commentController.getComments);

// ============ PROTECTED ROUTES (CẦN AUTHENTICATION) ============
// Tất cả routes sau đây đều cần authentication
router.use(authenticateToken);

// POST /comments/blog/:blogId - Tạo comment mới
router.post('/blog/:blogId', commentController.createComment);

// POST /comments/:commentId/like - Like comment
router.post('/:commentId/like', commentController.toggleLike);

// POST /comments/:commentId/dislike - Dislike comment
router.post('/:commentId/dislike', commentController.toggleDislike);

// DELETE /comments/:commentId - Xóa comment
router.delete('/:commentId', commentController.deleteComment);

module.exports = router;

