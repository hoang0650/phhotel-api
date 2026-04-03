const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// ============ PUBLIC ROUTES (KHÔNG CẦN AUTHENTICATION) ============
// POST /contacts - Tạo liên hệ mới (public)
router.post('/', contactController.createContact);

// ============ PROTECTED ROUTES (CHỈ ADMIN VÀ SUPERADMIN) ============
// Tất cả routes sau đây đều cần authentication và chỉ admin/superadmin
router.use(authenticateToken);
router.use(authorizeRoles(['admin', 'superadmin']));

// GET /contacts - Lấy danh sách liên hệ
router.get('/', contactController.getContacts);

// GET /contacts/stats - Lấy thống kê liên hệ
router.get('/stats', contactController.getContactStats);

// GET /contacts/:id - Lấy chi tiết liên hệ
router.get('/:id', contactController.getContactById);

// PATCH /contacts/:id/status - Cập nhật trạng thái liên hệ
router.patch('/:id/status', contactController.updateContactStatus);

// POST /contacts/:id/reply - Trả lời liên hệ
router.post('/:id/reply', contactController.replyContact);

// DELETE /contacts/:id - Xóa liên hệ
router.delete('/:id', contactController.deleteContact);

module.exports = router;

