const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess
} = require('../middlewares/auth');

// ============ PHIẾU CHI ============

/**
 * Tạo phiếu chi mới
 * POST /transactions/expense
 */
router.post(
    '/expense',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    transactionController.createExpense
);

/**
 * Lấy danh sách phiếu chi
 * GET /transactions/expense
 */
router.get(
    '/expense',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    transactionController.getExpenses
);

/**
 * Xóa phiếu chi
 * DELETE /transactions/expense/:id
 */
router.delete(
    '/expense/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    transactionController.deleteExpense
);

// ============ PHIẾU THU ============

/**
 * Tạo phiếu thu mới
 * POST /transactions/income
 */
router.post(
    '/income',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    transactionController.createIncome
);

/**
 * Lấy danh sách phiếu thu
 * GET /transactions/income
 */
router.get(
    '/income',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    transactionController.getIncomes
);

/**
 * Xóa phiếu thu
 * DELETE /transactions/income/:id
 */
router.delete(
    '/income/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    transactionController.deleteIncome
);

module.exports = router;

