const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { authenticateToken } = require('../middlewares/auth');

// ============ PUBLIC ROUTES (KHÔNG CẦN AUTHENTICATION) ============
// GET /blogs/public - Lấy danh sách blog công khai
router.get('/public', blogController.getPublicBlogs);

// GET /blogs/public/:id - Lấy blog công khai theo ID
router.get('/public/:id', blogController.getPublicBlogById);

// POST /blogs/public/:id/views - Tăng lượt xem
router.post('/public/:id/views', blogController.incrementViews);

// POST /blogs/public/:id/like - Like blog (cần auth)
router.post('/public/:id/like', authenticateToken, blogController.likeBlog);

// POST /blogs/public/:id/dislike - Dislike blog (cần auth)
router.post('/public/:id/dislike', authenticateToken, blogController.dislikeBlog);

// ============ PROTECTED ROUTES (CẦN AUTHENTICATION) ============
// Tất cả routes sau đây đều cần authentication
router.use(authenticateToken);

// GET /blogs - Lấy danh sách blog (admin)
router.get('/', blogController.getBlogs);

// GET /blogs/:id - Lấy blog theo ID (admin)
router.get('/:id', blogController.getBlogById);

// POST /blogs - Tạo blog mới
router.post('/', blogController.createBlog);

// PUT /blogs/:id - Cập nhật blog
router.put('/:id', blogController.updateBlog);

// DELETE /blogs/:id - Xóa blog
router.delete('/:id', blogController.deleteBlog);

module.exports = router;

