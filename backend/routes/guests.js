const express = require('express');
const router = express.Router();
const guestsController = require('../controllers/guestsController');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

// Lấy danh sách khách - Business, Hotel Manager, Staff có quyền xem
router.get(
  '/',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  guestsController.getGuests
);

// Lấy thông tin khách theo ID
router.get(
  '/:id',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  guestsController.getGuestById
);

// Tạo khách mới - Business, Hotel Manager, Staff có quyền tạo
router.post(
  '/',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  guestsController.createGuest
);

// Cập nhật thông tin khách - Business, Hotel Manager có quyền sửa (Staff không có quyền)
router.patch(
  '/:id',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
  guestsController.updateGuest
);

// Xóa khách - Chỉ Business và Hotel Manager có quyền xóa
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
  guestsController.deleteGuest
);

// Tạo booking cho khách (đặt phòng trước) - Business, Hotel Manager, Staff có quyền
router.post(
  '/:id/create-booking',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  guestsController.createBookingForGuest
);

// Assign khách vào phòng (check-in) - Business, Hotel Manager, Staff có quyền
router.post(
  '/:id/assign-room',
  authenticateToken,
  authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
  guestsController.assignGuestToRoom
);

module.exports = router;

