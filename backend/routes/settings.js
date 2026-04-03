const express = require('express');
const router = express.Router();
const {
    getAllSettings,
    getSettingsByType,
    updateSystemSettings,
    updateEmailSettings,
    updatePaymentSettings,
    updateNotificationSettings,
    updateGeneralSettings,
    testEmailConnection,
    sendTestEmail,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    markAnnouncementAsRead,
    markAllAnnouncementsAsRead,
    getUnreadAnnouncementsCount
} = require('../controllers/settings');

// Middleware để kiểm tra quyền (chỉ superadmin và admin)
// Lưu ý: authenticateToken middleware đã được áp dụng ở app.js
// authenticateToken sẽ populate req.user với full user object từ database
const checkSettingsPermission = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ 
            message: 'Chưa đăng nhập',
            debug: 'req.user is null or undefined'
        });
    }
    
    // req.user từ authenticateToken là Mongoose document hoặc plain object
    // Lấy role từ user object
    let userRole;
    if (typeof user === 'object' && user !== null) {
        // Nếu là Mongoose document, có thể cần toObject()
        if (user.toObject && typeof user.toObject === 'function') {
            userRole = user.toObject().role;
        } else {
            userRole = user.role;
        }
    }
    
    // Debug log
    console.log('Settings permission check:', {
        userId: user._id || user.id,
        userRole: userRole,
        userType: typeof user,
        isMongooseDoc: !!user.toObject
    });
    
    if (!userRole) {
        return res.status(403).json({ 
            message: 'Không tìm thấy role của người dùng',
            debug: {
                user: user,
                userRole: userRole
            }
        });
    }
    
    // Các settings khác chỉ cho superadmin và admin
    if (userRole !== 'superadmin' && userRole !== 'admin') {
        return res.status(403).json({ 
            message: 'Không có quyền truy cập cài đặt hệ thống',
            userRole: userRole,
            allowedRoles: ['superadmin', 'admin']
        });
    }
    
    next();
};

// Middleware kiểm tra quyền cho email settings (cho phép superadmin, admin, business)
const checkEmailSettingsPermission = (req, res, next) => {
    const user = req.user;
    if (!user) {
        return res.status(401).json({ 
            message: 'Chưa đăng nhập'
        });
    }
    
    let userRole;
    if (typeof user === 'object' && user !== null) {
        if (user.toObject && typeof user.toObject === 'function') {
            userRole = user.toObject().role;
        } else {
            userRole = user.role;
        }
    }
    
    const allowedRoles = ['superadmin', 'admin', 'business'];
    if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
            message: 'Không có quyền truy cập cài đặt email',
            userRole: userRole,
            allowedRoles: allowedRoles
        });
    }
    
    next();
};

/**
 * @swagger
 * /api/settings/announcements:
 *   get:
 *     summary: Lấy danh sách thông báo
 *     description: Tất cả người dùng đã đăng nhập đều có thể xem
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 announcements:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/announcements', getAnnouncements);
router.get('/announcements/unread-count', getUnreadAnnouncementsCount);
router.post('/announcements/:id/read', markAnnouncementAsRead);
router.post('/announcements/read-all', markAllAnnouncementsAsRead);

// Áp dụng middleware cho tất cả routes (trừ email routes và announcements GET)
router.use(checkSettingsPermission);

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Lấy tất cả cài đặt hệ thống
 *     description: Chỉ superadmin và admin mới có quyền truy cập
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tất cả cài đặt
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/', getAllSettings);

/**
 * @swagger
 * /api/settings/email:
 *   get:
 *     summary: Lấy cài đặt email
 *     description: Superadmin, admin và business có quyền truy cập
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cài đặt email
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/email', checkEmailSettingsPermission, (req, res, next) => {
    req.params = { type: 'email' };
    next();
}, getSettingsByType);

/**
 * @swagger
 * /api/settings/{type}:
 *   get:
 *     summary: Lấy cài đặt theo loại
 *     description: Chỉ superadmin và admin mới có quyền truy cập
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [system, email, payment, notification, general]
 *         description: Loại cài đặt
 *     responses:
 *       200:
 *         description: Cài đặt theo loại
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/:type', getSettingsByType);

/**
 * @swagger
 * /api/settings/system:
 *   put:
 *     summary: Cập nhật cài đặt hệ thống
 *     description: Chỉ superadmin và admin mới có quyền cập nhật
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               systemSettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật
 */
router.put('/system', updateSystemSettings);

/**
 * @swagger
 * /api/settings/payment:
 *   put:
 *     summary: Cập nhật cài đặt thanh toán
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật. 
 *       Bao gồm thông tin ngân hàng (QR code thanh toán) cho system settings.
 *       Thông tin này sẽ được sử dụng trong pricing component với thứ tự ưu tiên:
 *       1) Superadmin profile → 2) System Settings (phần này) → 3) User profile
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultPaymentMethod:
 *                 type: string
 *                 enum: [cash, bank_transfer, card, qr]
 *                 description: Phương thức thanh toán mặc định
 *               enableCash:
 *                 type: boolean
 *                 description: Bật thanh toán tiền mặt
 *               enableBankTransfer:
 *                 type: boolean
 *                 description: Bật thanh toán chuyển khoản
 *               enableCard:
 *                 type: boolean
 *                 description: Bật thanh toán thẻ
 *               enableQR:
 *                 type: boolean
 *                 description: Bật thanh toán QR code
 *               enableCrypto:
 *                 type: boolean
 *                 description: Bật thanh toán crypto
 *               enablePayPal:
 *                 type: boolean
 *                 description: Bật thanh toán PayPal
 *               autoReconcile:
 *                 type: boolean
 *                 description: Tự động đối soát
 *               reconcileFrequency:
 *                 type: string
 *                 enum: [hourly, daily, weekly]
 *                 description: Tần suất đối soát
 *               minimumBalanceAlert:
 *                 type: number
 *                 description: Số dư tối thiểu cảnh báo
 *               paymentTimeout:
 *                 type: number
 *                 description: Thời gian timeout thanh toán (giây)
 *               bankAccount:
 *                 type: object
 *                 description: Thông tin ngân hàng cho QR thanh toán
 *                 properties:
 *                   bankName:
 *                     type: string
 *                     description: Tên ngân hàng
 *                   accountNumber:
 *                     type: string
 *                     description: Số tài khoản
 *                   accountHolderName:
 *                     type: string
 *                     description: Tên chủ tài khoản
 *                   beneficiaryName:
 *                     type: string
 *                     description: Tên người thụ hưởng (hiển thị trên QR code)
 *                   branch:
 *                     type: string
 *                     description: Chi nhánh ngân hàng
 *                   swiftCode:
 *                     type: string
 *                     description: SWIFT/BIC Code
 *                   iban:
 *                     type: string
 *                     description: IBAN
 *                   qrPaymentUrl:
 *                     type: string
 *                     format: uri
 *                     description: "URL QR code thanh toán SePay (ví dụ: https://qr.sepay.vn/img?acc=...&bank=...)"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Payment settings đã được cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật (chỉ superadmin/admin)
 *       500:
 *         description: Lỗi server
 */
router.put('/payment', updatePaymentSettings);

/**
 * @swagger
 * /api/settings/notification:
 *   put:
 *     summary: Cập nhật cài đặt thông báo hệ thống
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật.
 *       Cài đặt này áp dụng cho toàn hệ thống. Nếu khách sạn có cài đặt riêng, sẽ ưu tiên cài đặt của khách sạn.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enableEmailNotifications:
 *                 type: boolean
 *                 description: Bật thông báo Email
 *                 default: true
 *               enableSMSNotifications:
 *                 type: boolean
 *                 description: Bật thông báo SMS
 *                 default: false
 *               enablePushNotifications:
 *                 type: boolean
 *                 description: Bật thông báo Push
 *                 default: true
 *               notifyOnBooking:
 *                 type: boolean
 *                 description: Thông báo khi có đặt phòng
 *                 default: true
 *               notifyOnCheckin:
 *                 type: boolean
 *                 description: Thông báo khi check-in
 *                 default: true
 *               notifyOnCheckout:
 *                 type: boolean
 *                 description: Thông báo khi check-out
 *                 default: true
 *               notifyOnPayment:
 *                 type: boolean
 *                 description: Thông báo khi thanh toán
 *                 default: true
 *               notifyOnCancellation:
 *                 type: boolean
 *                 description: Thông báo khi hủy đặt phòng
 *                 default: true
 *               notifyOnLowInventory:
 *                 type: boolean
 *                 description: Thông báo khi hết hàng
 *                 default: true
 *               notifyOnSystemError:
 *                 type: boolean
 *                 description: Thông báo lỗi hệ thống
 *                 default: true
 *               notificationEmail:
 *                 type: string
 *                 format: email
 *                 description: Email nhận thông báo
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.put('/notification', updateNotificationSettings);

/**
 * @swagger
 * /api/settings/general:
 *   put:
 *     summary: Cập nhật cài đặt chung
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật. 
 *       Bao gồm thông tin ngân hàng (QR code thanh toán) cho system settings.
 *       Thông tin này sẽ được sử dụng trong pricing component với thứ tự ưu tiên:
 *       1) Superadmin profile → 2) System Settings (phần này) → 3) User profile
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 description: Tên công ty
 *               companyAddress:
 *                 type: string
 *                 description: Địa chỉ công ty
 *               companyPhone:
 *                 type: string
 *                 description: Số điện thoại công ty
 *               companyEmail:
 *                 type: string
 *                 format: email
 *                 description: Email công ty
 *               maintenanceMode:
 *                 type: boolean
 *                 description: Chế độ bảo trì
 *               bankAccount:
 *                 type: object
 *                 description: Thông tin ngân hàng cho QR thanh toán
 *                 properties:
 *                   bankName:
 *                     type: string
 *                     description: Tên ngân hàng
 *                   accountNumber:
 *                     type: string
 *                     description: Số tài khoản
 *                   accountHolderName:
 *                     type: string
 *                     description: Tên chủ tài khoản
 *                   beneficiaryName:
 *                     type: string
 *                     description: Tên người thụ hưởng (hiển thị trên QR code)
 *                   branch:
 *                     type: string
 *                     description: Chi nhánh ngân hàng
 *                   swiftCode:
 *                     type: string
 *                     description: SWIFT/BIC Code
 *                   iban:
 *                     type: string
 *                     description: IBAN
 *                   qrPaymentUrl:
 *                     type: string
 *                     format: uri
 *                     description: "URL QR code thanh toán SePay (ví dụ: https://qr.sepay.vn/img?acc=...&bank=...)"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: General settings đã được cập nhật
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật (chỉ superadmin/admin)
 *       500:
 *         description: Lỗi server
 */
router.put('/general', updateGeneralSettings);

/**
 * @swagger
 * /api/settings/email:
 *   put:
 *     summary: Cập nhật cài đặt email
 *     description: Superadmin, admin và business có quyền cập nhật
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailSettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/email', checkEmailSettingsPermission, updateEmailSettings);

/**
 * @swagger
 * /api/settings/email/test-connection:
 *   post:
 *     summary: Kiểm tra kết nối email
 *     description: Superadmin, admin và business có quyền sử dụng
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kết nối thành công
 *       400:
 *         description: Kết nối thất bại
 */
router.post('/email/test-connection', checkEmailSettingsPermission, testEmailConnection);

/**
 * @swagger
 * /api/settings/email/send-test:
 *   post:
 *     summary: Gửi email test
 *     description: Superadmin, admin và business có quyền sử dụng
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *             properties:
 *               to:
 *                 type: string
 *                 format: email
 *                 description: Email nhận
 *     responses:
 *       200:
 *         description: Gửi email thành công
 */
router.post('/email/send-test', checkEmailSettingsPermission, sendTestEmail);

/**
 * @swagger
 * /api/settings/announcements:
 *   post:
 *     summary: Tạo thông báo mới
 *     description: Chỉ superadmin và admin mới có quyền tạo
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [maintenance, update, info, warning, success]
 *                 description: Loại thông báo
 *               title:
 *                 type: string
 *                 description: Tiêu đề thông báo
 *               message:
 *                 type: string
 *                 description: Nội dung thông báo
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 description: Độ ưu tiên
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày bắt đầu hiển thị
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày kết thúc hiển thị (tùy chọn)
 *               isActive:
 *                 type: boolean
 *                 description: Trạng thái hoạt động
 *               targetType:
 *                 type: string
 *                 enum: [system, business, hotel]
 *                 description: Loại đối tượng nhận (system = tất cả, business = theo doanh nghiệp, hotel = theo khách sạn)
 *               targetRoles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách vai trò nhận thông báo (để trống = tất cả)
 *               targetBusinesses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID doanh nghiệp (chỉ dùng khi targetType = 'business')
 *               targetHotels:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách ID khách sạn (chỉ dùng khi targetType = 'hotel')
 *               notificationType:
 *                 type: string
 *                 enum: [booking, checkin, checkout, payment, cancellation, lowInventory, systemError, general]
 *                 description: Loại thông báo để map với notifyOn* settings (general = luôn hiển thị, không phụ thuộc vào notifyOn*)
 *     responses:
 *       201:
 *         description: Tạo thông báo thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo
 */
router.post('/announcements', createAnnouncement);

/**
 * @swagger
 * /api/settings/announcements/{id}:
 *   put:
 *     summary: Cập nhật thông báo
 *     description: Chỉ superadmin và admin mới có quyền cập nhật
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID thông báo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [maintenance, update, info, warning, success]
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 *               targetType:
 *                 type: string
 *                 enum: [system, business, hotel]
 *               targetRoles:
 *                 type: array
 *                 items:
 *                   type: string
 *               targetBusinesses:
 *                 type: array
 *                 items:
 *                   type: string
 *               targetHotels:
 *                 type: array
 *                 items:
 *                   type: string
 *               notificationType:
 *                 type: string
 *                 enum: [booking, checkin, checkout, payment, cancellation, lowInventory, systemError, general]
 *                 description: Loại thông báo để map với notifyOn* settings
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xóa thông báo
 *     description: Chỉ superadmin và admin mới có quyền xóa
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID thông báo
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
router.put('/announcements/:id', updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

module.exports = router;
