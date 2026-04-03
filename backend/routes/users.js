var express = require('express');
var router = express.Router();
const { 
    getUserInfo, 
    createUser, 
    registerUser,
    login, 
    refreshAccessToken,
    logout,
    createBusinessUser, 
    getUsersByRole,
    getAllUsers,
    getUsersByBusiness,
    getUsersByHotel,
    updateUser, 
    updateUserStatus,
    changePassword,
    getProfile,
    updatePreferences,
    updateProfile,
    forgotPassword,
    resetPassword,
    sendVerificationEmail,
    verifyEmail
} = require('../controllers/users');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Lấy danh sách tất cả người dùng
 *     description: |
 *       Chỉ superadmin và admin mới có quyền truy cập.
 *       - Superadmin: Xem tất cả users (bao gồm admin)
 *       - Admin: Xem tất cả users trừ superadmin
 *       - Business và các role khác: Không được phép truy cập
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập (chỉ superadmin và admin mới được phép)
 */
router.get('/', authenticateToken, authorizeRoles(['superadmin', 'admin']), getAllUsers);

/**
 * @swagger
 * /users/signup:
 *   post:
 *     summary: Đăng ký người dùng mới
 *     description: Chỉ superadmin và admin mới có quyền tạo người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 description: Tên đăng nhập
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email người dùng
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu (tối thiểu 6 ký tự)
 *               role:
 *                 type: string
 *                 enum: [superadmin, admin, business, hotel, staff, guest]
 *                 description: Vai trò người dùng
 *               businessId:
 *                 type: string
 *                 description: ID doanh nghiệp (nếu role là business hoặc hotel)
 *               hotelId:
 *                 type: string
 *                 description: ID khách sạn (nếu role là hotel hoặc staff)
 *     responses:
 *       201:
 *         description: Tạo người dùng thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo người dùng
 */
// Route để admin tạo user (yêu cầu authentication)
router.post('/signup', authenticateToken, authorizeRoles(['superadmin', 'admin']), createUser);

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Đăng ký tài khoản công khai (không yêu cầu authentication)
 *     description: Cho phép người dùng tự đăng ký tài khoản với role 'guest'
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Tên đăng nhập
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email người dùng
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu (tối thiểu 6 ký tự)
 *               fullName:
 *                 type: string
 *                 description: Họ và tên
 *               phone:
 *                 type: string
 *                 description: Số điện thoại
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc email/username đã tồn tại
 */
router.post('/register', registerUser);

// Gửi email xác thực (yêu cầu đăng nhập)
router.post('/email/send-verification', authenticateToken, authorizeRoles(['superadmin','admin','business','hotel','staff','guest']), sendVerificationEmail);

// Xác nhận email qua token (public, dùng trong link email)
router.get('/email/verify', verifyEmail);

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Đăng nhập người dùng
 *     description: Xác thực người dùng và trả về JWT token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Tên đăng nhập hoặc email
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Thông tin đăng nhập không đúng
 */
router.post('/login', login);
router.post('/refresh-token', refreshAccessToken);
router.post('/logout', logout);

/**
 * @swagger
 * /users/info:
 *   get:
 *     summary: Lấy thông tin người dùng từ JWT token
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Token không hợp lệ
 */
router.get('/info', authenticateToken, getUserInfo);

/**
 * @swagger
 * /users/profile:
 *   get:
 *     summary: Lấy thông tin profile của người dùng hiện tại
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa đăng nhập
 */
router.get('/profile', authenticateToken, getProfile);

/**
 * @swagger
 * /users/profile:
 *   put:
 *     summary: Cập nhật profile người dùng
 *     description: Cập nhật thông tin cá nhân và tài khoản ngân hàng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
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
 *       401:
 *         description: Chưa đăng nhập
 */
router.put('/profile', authenticateToken, updateProfile);

/**
 * @swagger
 * /users/preferences:
 *   put:
 *     summary: Cập nhật preferences của người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put('/preferences', authenticateToken, updatePreferences);

/**
 * @swagger
 * /users/business/signup:
 *   post:
 *     summary: Đăng ký người dùng business mới
 *     description: Tạo người dùng business cùng với thông tin doanh nghiệp
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - businessName
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               businessName:
 *                 type: string
 *               businessInfo:
 *                 type: object
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 */
router.post('/business/signup', createBusinessUser);

/**
 * @swagger
 * /users/role/{role}:
 *   get:
 *     summary: Lấy danh sách người dùng theo vai trò
 *     description: Chỉ superadmin và admin mới có quyền truy cập
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [superadmin, admin, business, hotel, staff, guest]
 *         description: Vai trò người dùng
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/role/:role', authenticateToken, authorizeRoles(['superadmin', 'admin']), getUsersByRole);

/**
 * @swagger
 * /users/business/{businessId}:
 *   get:
 *     summary: Lấy danh sách người dùng theo business ID
 *     description: |
 *       - Superadmin và Admin: Có thể xem users của bất kỳ business nào
 *       - Business: Chỉ có thể xem users thuộc business của chính mình
 *     tags: [Users]
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
 *         description: Danh sách người dùng thuộc business
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập (business chỉ xem được business của mình)
 */
router.get('/business/:businessId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business']), getUsersByBusiness);

/**
 * @swagger
 * /users/hotel/{hotelId}:
 *   get:
 *     summary: Lấy danh sách người dùng theo hotel ID
 *     description: |
 *       - Superadmin và Admin: Có thể xem users của bất kỳ hotel nào
 *       - Business: Có thể xem users của hotels thuộc business của mình
 *       - Hotel Manager: Chỉ có thể xem users thuộc hotel của chính mình
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: hotelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID khách sạn
 *     responses:
 *       200:
 *         description: Danh sách người dùng thuộc hotel
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập (chỉ xem được hotel của mình)
 */
router.get('/hotel/:hotelId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), getUsersByHotel);

/**
 * @swagger
 * /users/{userId}:
 *   put:
 *     summary: Cập nhật thông tin người dùng
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật.
 *       - Superadmin: Có thể cập nhật tất cả users (bao gồm admin, có thể chỉnh sửa role)
 *       - Admin: Có thể cập nhật tất cả users trừ superadmin và admin khác
 *       - Business và các role khác: Không được phép cập nhật
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID người dùng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               fullName:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [superadmin, admin, business, hotel, staff, guest]
 *                 description: Vai trò người dùng (chỉ superadmin mới có thể thay đổi role của admin)
 *               businessId:
 *                 type: string
 *               hotelId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended, deleted]
 *               twoFactorEnabled:
 *                 type: boolean
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới (nếu muốn đổi)
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật hoặc không thể thay đổi role của admin/superadmin
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put('/:userId', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateUser);

/**
 * @swagger
 * /users/{userId}/status:
 *   put:
 *     summary: Cập nhật trạng thái người dùng (khóa, kích hoạt, xóa)
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật.
 *       - Superadmin: Có thể khóa/xóa tất cả users (bao gồm admin)
 *       - Admin: Có thể khóa/xóa tất cả users trừ superadmin và admin khác
 *       - Không thể tự xóa chính mình
 *       - Khi khóa business/hotel sẽ cascade khóa tất cả users thuộc business/hotel đó
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID người dùng
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
 *                 enum: [active, inactive, suspended, deleted]
 *                 description: |
 *                   Trạng thái người dùng:
 *                   - active: Hoạt động
 *                   - inactive: Không hoạt động
 *                   - suspended: Tạm khóa
 *                   - deleted: Đã xóa
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Trạng thái không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: |
 *           Không có quyền cập nhật hoặc:
 *           - Admin không thể khóa/xóa superadmin
 *           - Admin không thể khóa/xóa admin khác
 *           - Không thể tự xóa chính mình
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put('/:userId/status', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateUserStatus);

/**
 * @swagger
 * /users/{userId}/change-password:
 *   put:
 *     summary: Đổi mật khẩu người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID người dùng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu cũ
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới (tối thiểu 6 ký tự)
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu cũ không đúng
 *       401:
 *         description: Chưa đăng nhập
 */
router.put('/:userId/change-password', authenticateToken, changePassword);
router.put('/:userId/password', authenticateToken, changePassword);

/**
 * @swagger
 * /users/forgot-password:
 *   post:
 *     summary: Yêu cầu reset mật khẩu
 *     description: Gửi email chứa link reset mật khẩu
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email người dùng
 *     responses:
 *       200:
 *         description: Email reset mật khẩu đã được gửi
 *       404:
 *         description: Không tìm thấy người dùng với email này
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /users/reset-password:
 *   post:
 *     summary: Reset mật khẩu với token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token reset mật khẩu từ email
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 description: Mật khẩu mới
 *     responses:
 *       200:
 *         description: Reset mật khẩu thành công
 *       400:
 *         description: Token không hợp lệ hoặc đã hết hạn
 */
router.post('/reset-password', resetPassword);

module.exports = router;
