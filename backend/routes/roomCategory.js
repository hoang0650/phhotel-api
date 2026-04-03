const express = require('express');
const router = express.Router();
const roomCategoryController = require('../controllers/roomCategoryController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess
} = require('../middlewares/auth');

/**
 * Tạo loại phòng mới
 * POST /api/room-categories
 */
router.post(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    roomCategoryController.create
);

/**
 * Lấy danh sách loại phòng theo hotelId
 * GET /api/room-categories?hotelId=xxx
 */
router.get(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    roomCategoryController.getAll
);

/**
 * Lấy loại phòng theo ID
 * GET /api/room-categories/:id
 */
router.get(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    roomCategoryController.getById
);

/**
 * Cập nhật loại phòng
 * PUT /api/room-categories/:id
 */
router.put(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    roomCategoryController.update
);

/**
 * Xóa loại phòng
 * DELETE /api/room-categories/:id
 */
router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    roomCategoryController.delete
);

module.exports = router;
