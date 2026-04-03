const express = require('express');
const router = express.Router();
const shiftHandoverController = require('../controllers/shiftHandover');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess,
    authorizeShiftHistoryAccess
} = require('../middlewares/auth');

// ============ GIAO CA ============

/**
 * @swagger
 * /shift-handover:
 *   post:
 *     summary: Tạo giao ca mới
 *     description: Nhân viên giao ca cho nhân viên khác, xác nhận bằng mật khẩu
 *     tags: [Shift Handover]
 */
router.post(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    shiftHandoverController.createShiftHandover
);

// ============ GIAO TIỀN QUẢN LÝ ============

/**
 * @swagger
 * /shift-handover/manager:
 *   post:
 *     summary: Giao tiền cho quản lý
 *     description: Nhân viên giao tiền cho quản lý/chủ doanh nghiệp
 *     tags: [Shift Handover]
 */
router.post(
    '/manager',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    shiftHandoverController.createManagerHandover
);

// ============ LỊCH SỬ GIAO CA (CHỈ ADMIN/BUSINESS) ============

/**
 * @swagger
 * /shift-handover/history:
 *   get:
 *     summary: Lấy lịch sử giao ca
 *     description: Chỉ admin hoặc business được quyền xem
 *     tags: [Shift Handover]
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 */
router.get(
    '/history',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeShiftHistoryAccess,
    shiftHandoverController.getShiftHandoverHistory
);

/**
 * @swagger
 * /shift-handover/history/{id}:
 *   get:
 *     summary: Lấy chi tiết một lần giao ca
 *     description: Chỉ admin hoặc business được quyền xem
 *     tags: [Shift Handover]
 */
router.get(
    '/history/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeShiftHistoryAccess,
    shiftHandoverController.getShiftHandoverById
);

// ============ THỐNG KÊ GIAO CA ============

/**
 * @swagger
 * /shift-handover/stats:
 *   get:
 *     summary: Thống kê giao ca theo khách sạn
 *     description: Chỉ admin hoặc business được quyền xem
 *     tags: [Shift Handover]
 */
router.get(
    '/stats',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business']),
    authorizeShiftHistoryAccess,
    shiftHandoverController.getShiftHandoverStats
);

// ============ TÍNH TOÁN DOANH THU ============

/**
 * @swagger
 * /shift-handover/revenue:
 *   get:
 *     summary: Tính doanh thu khách sạn
 *     description: Tổng doanh thu = Tiền mặt + Chuyển khoản + Cà thẻ - Tiền chi
 *     tags: [Shift Handover]
 */
router.get(
    '/revenue',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    shiftHandoverController.calculateRevenue
);

// Lấy doanh thu theo period (ngày/tuần/tháng) cho biểu đồ
router.get(
    '/revenue/period',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    shiftHandoverController.getRevenueByPeriod
);

// Lấy số lượng check-in theo period (ngày/tuần/tháng) cho thống kê bán phòng
router.get(
    '/checkin-count/period',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    shiftHandoverController.getCheckinCountByPeriod
);

// ============ LẤY SỐ TIỀN CA TRƯỚC ============

/**
 * @swagger
 * /shift-handover/previous-amount:
 *   get:
 *     summary: Lấy số tiền từ ca trước
 *     description: Để tính cho ca hiện tại
 *     tags: [Shift Handover]
 */
router.get(
    '/previous-amount',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    shiftHandoverController.getPreviousShiftAmount
);

module.exports = router;

