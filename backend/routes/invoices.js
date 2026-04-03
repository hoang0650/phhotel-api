const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess
} = require('../middlewares/auth');

// ============ HÓA ĐƠN ============

/**
 * Tạo hóa đơn mới
 * POST /invoices
 */
router.post(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.createInvoice
);

/**
 * Lấy danh sách hóa đơn
 * GET /invoices
 */
router.get(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.getInvoices
);

/**
 * Lấy thống kê hóa đơn
 * GET /invoices/stats
 * PHẢI đặt trước /:id để tránh conflict
 */
router.get(
    '/stats',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    invoiceController.getInvoiceStats
);

/**
 * Xem hóa đơn nháp (EasyInvoice)
 * POST /invoices/easy-invoice/preview
 * PHẢI đặt trước /:id để tránh conflict
 */
router.post(
    '/easy-invoice/preview',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.previewEasyInvoice
);

/**
 * Xuất hóa đơn điện tử (EasyInvoice)
 * POST /invoices/easy-invoice/export
 * PHẢI đặt trước /:id để tránh conflict
 */
router.post(
    '/easy-invoice/export',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.exportEasyInvoice
);

/**
 * Gửi hóa đơn qua email
 * POST /invoices/:id/email
 * PHẢI đặt trước /:id để tránh conflict
 */
router.post(
    '/:id/email',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.sendInvoiceEmail
);

/**
 * Lấy chi tiết một hóa đơn
 * GET /invoices/:id
 */
router.get(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    invoiceController.getInvoiceById
);

/**
 * Cập nhật hóa đơn
 * PUT /invoices/:id
 */
router.put(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    invoiceController.updateInvoice
);

/**
 * Xóa hóa đơn
 * DELETE /invoices/:id
 */
router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business']),
    authorizeHotelAccess,
    invoiceController.deleteInvoice
);

module.exports = router;

