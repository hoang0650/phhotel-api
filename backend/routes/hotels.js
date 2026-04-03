const express = require('express');
const router = express.Router();
const { 
    createHotel,
    getHotels,
    getHotelsByBusiness,
    getHotelById,
    updateHotel,
    updateHotelStatus,
    deleteHotel,
    uploadHotelImages,
    deleteHotelImage,
    updateHotelSettings,
    updateHotelBankAccount,
    createService,
    editService,
    deleteService  
} = require('../controllers/hotels');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

/**
 * @swagger
 * /hotels:
 *   get:
 *     summary: Lấy danh sách khách sạn
 *     description: |
 *       Phân quyền theo role:
 *       - Superadmin/Admin: Thấy tất cả khách sạn
 *       - Business: Chỉ thấy các khách sạn thuộc businessId của mình
 *       - Hotel Manager: Chỉ thấy khách sạn của mình (theo hotelId)
 *       - Staff: Chỉ thấy khách sạn của mình (theo hotelId)
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema:
 *           type: string
 *         description: Lọc theo businessId (chỉ admin/superadmin)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, maintenance]
 *         description: Lọc theo trạng thái
 *     responses:
 *       200:
 *         description: Danh sách khách sạn (đã được filter theo quyền)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Hotel'
 *             example:
 *               - _id: "507f1f77bcf86cd799439011"
 *                 name: "Khách sạn ABC"
 *                 businessId: "507f1f77bcf86cd799439012"
 *                 status: "active"
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       500:
 *         description: Lỗi server
 */
router.get('/', authenticateToken, getHotels);

/**
 * @swagger
 * /hotels/business/{businessId}:
 *   get:
 *     summary: Lấy danh sách khách sạn theo business ID
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
 *     responses:
 *       200:
 *         description: Danh sách khách sạn
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/business/:businessId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business']), getHotelsByBusiness);

/**
 * @swagger
 * /hotels/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết khách sạn theo ID
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Thông tin khách sạn
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Hotel'
 *       404:
 *         description: Không tìm thấy khách sạn
 */
router.get('/:id', authenticateToken, getHotelById);

/**
 * @swagger
 * /hotels:
 *   post:
 *     summary: Tạo khách sạn mới
 *     description: |
 *       Chỉ superadmin và admin mới có quyền tạo khách sạn.
 *       Business KHÔNG thể tạo khách sạn, chỉ có thể xem các khách sạn thuộc businessId của mình.
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - businessId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên khách sạn
 *               businessId:
 *                 type: string
 *                 description: ID doanh nghiệp
 *               address:
 *                 type: object
 *                 properties:
 *                   street: { type: string }
 *                   city: { type: string }
 *                   state: { type: string }
 *                   country: { type: string }
 *               contactInfo:
 *                 type: object
 *                 properties:
 *                   email: { type: string }
 *                   phone: { type: string }
 *               description:
 *                 type: string
 *               starRating:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 5
 *               facilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, maintenance]
 *                 default: active
 *     responses:
 *       201:
 *         description: Tạo khách sạn thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Hotel'
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc thiếu thông tin
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo khách sạn (chỉ superadmin/admin)
 */
router.post('/', authenticateToken, authorizeRoles(['superadmin', 'admin']), createHotel);

/**
 * @swagger
 * /hotels/{id}:
 *   put:
 *     summary: Cập nhật thông tin khách sạn
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật khách sạn.
 *       Business và Hotel Manager KHÔNG thể cập nhật khách sạn, chỉ có thể xem.
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: object
 *               contactInfo:
 *                 type: object
 *               description:
 *                 type: string
 *               starRating:
 *                 type: number
 *               facilities:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, maintenance]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Hotel'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật (chỉ superadmin/admin)
 *       404:
 *         description: Không tìm thấy khách sạn
 */
router.put('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateHotel);

/**
 * @swagger
 * /hotels/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái khách sạn
 *     description: Chỉ superadmin và admin mới có quyền cập nhật
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, blocked]
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật
 */
router.patch('/:id/status', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateHotelStatus);
router.put('/:id/status', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateHotelStatus);

/**
 * @swagger
 * /hotels/{id}:
 *   delete:
 *     summary: Xóa khách sạn
 *     description: Chỉ superadmin và admin mới có quyền xóa
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy khách sạn
 */
router.delete('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), deleteHotel);

/**
 * @swagger
 * /hotels/{id}/images:
 *   post:
 *     summary: Tải lên hình ảnh khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Tải lên thành công
 *       401:
 *         description: Chưa đăng nhập
 */
router.post('/:id/images', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), uploadHotelImages);

/**
 * @swagger
 * /hotels/{id}/images/{imageIndex}:
 *   delete:
 *     summary: Xóa hình ảnh khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: path
 *         name: imageIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Index của hình ảnh trong mảng
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       401:
 *         description: Chưa đăng nhập
 */
router.delete('/:id/images/:imageIndex', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), deleteHotelImage);

/**
 * @swagger
 * /hotels/{id}/settings:
 *   put:
 *     summary: Cập nhật cài đặt khách sạn
 *     description: Chỉ superadmin, admin và hotel manager có quyền cập nhật. Business không thể cập nhật.
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enableQRPaymentForBankTransfer:
 *                 type: boolean
 *                 description: Bật QR thanh toán khi chuyển khoản trong room
 *               enableOTAManagement:
 *                 type: boolean
 *                 description: Bật quản lý OTA
 *               enableEmailManagement:
 *                 type: boolean
 *                 description: Bật quản lý email
 *               enableElectricManagement:
 *                 type: boolean
 *                 description: Bật quản lý điện
 *               enablePayPalPayment:
 *                 type: boolean
 *                 description: Bật thanh toán PayPal
 *               enableCryptoPayment:
 *                 type: boolean
 *                 description: Bật thanh toán Crypto
 *               enableDraftInvoice:
 *                 type: boolean
 *                 description: Bật xem hóa đơn nháp
 *               enableExportInvoice:
 *                 type: boolean
 *                 description: Bật xuất hóa đơn
 *               enableAiChatbox:
 *                 type: boolean
 *                 description: Bật AI Chatbox
 *               notificationSettings:
 *                 type: object
 *                 description: Cài đặt thông báo cho khách sạn (ghi đè cài đặt hệ thống)
 *                 properties:
 *                   enableEmailNotifications:
 *                     type: boolean
 *                     description: Bật thông báo Email
 *                   enableSMSNotifications:
 *                     type: boolean
 *                     description: Bật thông báo SMS
 *                   enablePushNotifications:
 *                     type: boolean
 *                     description: Bật thông báo Push
 *                   notifyOnBooking:
 *                     type: boolean
 *                     description: Thông báo khi có đặt phòng
 *                   notifyOnCheckin:
 *                     type: boolean
 *                     description: Thông báo khi check-in
 *                   notifyOnCheckout:
 *                     type: boolean
 *                     description: Thông báo khi check-out
 *                   notifyOnPayment:
 *                     type: boolean
 *                     description: Thông báo khi thanh toán
 *                   notifyOnCancellation:
 *                     type: boolean
 *                     description: Thông báo khi hủy đặt phòng
 *                   notifyOnLowInventory:
 *                     type: boolean
 *                     description: Thông báo khi hết hàng
 *                   notifyOnSystemError:
 *                     type: boolean
 *                     description: Thông báo lỗi hệ thống
 *                   notificationEmail:
 *                     type: string
 *                     format: email
 *                     description: Email nhận thông báo
 *     responses:
 *       200:
 *         description: Cập nhật cài đặt thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 settings:
 *                   type: object
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật
 *       404:
 *         description: Không tìm thấy khách sạn
 *   patch:
 *     summary: Cập nhật cài đặt khách sạn (PATCH)
 *     description: Tương tự PUT nhưng chỉ cập nhật các trường được gửi lên
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enableQRPaymentForBankTransfer:
 *                 type: boolean
 *               notificationSettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật cài đặt thành công
 */
router.put('/:id/settings', authenticateToken, authorizeRoles(['superadmin', 'admin', 'hotel']), updateHotelSettings);
router.patch('/:id/settings', authenticateToken, authorizeRoles(['superadmin', 'admin', 'hotel']), updateHotelSettings);

/**
 * @swagger
 * /hotels/{id}/bank-account:
 *   put:
 *     summary: Cập nhật thông tin ngân hàng cho khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankAccount
 *             properties:
 *               bankAccount:
 *                 type: object
 *                 properties:
 *                   bankName:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   accountHolderName:
 *                     type: string
 *                   beneficiaryName:
 *                     type: string
 *                   qrPaymentUrl:
 *                     type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   patch:
 *     summary: Cập nhật thông tin ngân hàng cho khách sạn (PATCH)
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankAccount
 *             properties:
 *               bankAccount:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/:id/bank-account', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), updateHotelBankAccount);
router.patch('/:id/bank-account', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), updateHotelBankAccount);

/**
 * @swagger
 * /hotels/{id}/services:
 *   post:
 *     summary: Tạo dịch vụ mới cho khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên dịch vụ
 *               price:
 *                 type: number
 *                 description: Giá dịch vụ
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tạo dịch vụ thành công
 *       401:
 *         description: Chưa đăng nhập
 */
router.post('/:id/services', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), createService);

/**
 * @swagger
 * /hotels/{id}/services/{serviceId}:
 *   put:
 *     summary: Cập nhật dịch vụ của khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dịch vụ
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy dịch vụ
 *   delete:
 *     summary: Xóa dịch vụ của khách sạn
 *     tags: [Hotels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dịch vụ
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       404:
 *         description: Không tìm thấy dịch vụ
 */
router.put('/:id/services/:serviceId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), editService);
router.delete('/:id/services/:serviceId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), deleteService);

module.exports = router;
