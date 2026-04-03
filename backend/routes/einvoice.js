const express = require('express');
const router = express.Router();
const einvoiceController = require('../controllers/einvoiceController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess
} = require('../middlewares/auth');

// ============ HÓA ĐƠN ĐIỆN TỬ (SEPAY EINVOICE) ============

/**
 * Đăng nhập Sepay eInvoice
 * POST /e-invoice/login
 */
router.post(
    '/login',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.login
);

/**
 * Đăng xuất Sepay eInvoice
 * POST /e-invoice/logout
 */
router.post(
    '/logout',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.logout
);

/**
 * Lấy danh sách tài khoản nhà cung cấp
 * GET /e-invoice/provider-accounts
 */
router.get(
    '/provider-accounts',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.getProviderAccounts
);

/**
 * Lấy chi tiết tài khoản nhà cung cấp
 * GET /e-invoice/provider-accounts/:id
 */
router.get(
    '/provider-accounts/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.getProviderAccountDetails
);

/**
 * Kiểm tra hạn ngạch
 * GET /e-invoice/usage
 */
router.get(
    '/usage',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.getUsage
);

/**
 * Phân chia quota cho hotel
 * POST /e-invoice/quota/allocate
 */
router.post(
    '/quota/allocate',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin']),
    einvoiceController.allocateQuota
);

/**
 * Lấy danh sách quota của các hotel
 * GET /e-invoice/quota/hotels
 */
router.get(
    '/quota/hotels',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin']),
    einvoiceController.getHotelQuotas
);

/**
 * Lấy danh sách hóa đơn nháp (drafts)
 * GET /e-invoice/drafts
 */
router.get(
    '/drafts',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.getDrafts
);

/**
 * Lấy danh sách hóa đơn đã phát hành (issued)
 * GET /e-invoice/issued
 */
router.get(
    '/issued',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.getIssuedInvoices
);

/**
 * Danh sách hóa đơn điện tử
 * GET /e-invoice
 */
router.get(
    '/',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.listInvoices
);

/**
 * Tạo hóa đơn điện tử
 * POST /e-invoice/create
 */
router.post(
    '/create',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.createInvoice
);

/**
 * Kiểm tra trạng thái tạo hóa đơn
 * GET /e-invoice/create/check/:trackingCode
 */
router.get(
    '/create/check/:trackingCode',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.checkCreateStatus
);

/**
 * Phát hành hóa đơn điện tử
 * POST /e-invoice/issue
 */
router.post(
    '/issue',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.issueInvoice
);

/**
 * Kiểm tra trạng thái phát hành hóa đơn
 * GET /e-invoice/issue/check/:trackingCode
 */
router.get(
    '/issue/check/:trackingCode',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.checkIssueStatus
);

/**
 * Proxy để lấy PDF hóa đơn (tránh download)
 * GET /e-invoice/pdf-proxy?url=...
 * Lưu ý: Route này phải đặt TRƯỚC route /:referenceCode để tránh conflict
 */
router.get(
    '/pdf-proxy',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.getPdfProxy
);

/**
 * Lấy chi tiết hóa đơn điện tử
 * GET /e-invoice/:referenceCode
 * Lưu ý: Route này phải đặt sau các route cụ thể khác
 */
router.get(
    '/:referenceCode',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    einvoiceController.getInvoiceDetails
);

/**
 * Đăng ký gói hóa đơn điện tử
 * POST /e-invoice/register
 */
router.post(
    '/register',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    einvoiceController.registerEInvoicePackages
);

module.exports = router;

