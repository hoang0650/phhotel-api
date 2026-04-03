const express = require('express');
const router = express.Router();
const { 
    createBusiness, 
    updateBusiness, 
    updateBusinessStatus, 
    getAllBusinesses, 
    getBusinessById,
    getBusinessByOwner,
    deleteBusiness,
    updateSubscription
} = require('../controllers/business');
const { authenticateToken, authorizeRoles, authorizeBusinessAccess } = require('../middlewares/auth');

/**
 * @swagger
 * /businesses:
 *   get:
 *     summary: Lấy danh sách doanh nghiệp
 *     description: |
 *       Phân quyền theo role:
 *       - Superadmin/Admin: Thấy tất cả doanh nghiệp
 *       - Business: Chỉ thấy doanh nghiệp của mình (theo businessId)
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách doanh nghiệp (đã được filter theo quyền)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Business'
 *       401:
 *         description: Chưa đăng nhập hoặc token không hợp lệ
 *       403:
 *         description: Không có quyền truy cập
 */
router.get('/', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business']), getAllBusinesses);

/**
 * @swagger
 * /businesses/owner/{ownerId}:
 *   get:
 *     summary: Lấy doanh nghiệp theo owner ID
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ownerId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID chủ sở hữu
 *     responses:
 *       200:
 *         description: Thông tin doanh nghiệp
 *       404:
 *         description: Không tìm thấy doanh nghiệp
 */
router.get('/owner/:ownerId', authenticateToken, getBusinessByOwner);

/**
 * @swagger
 * /businesses/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết doanh nghiệp theo ID
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
 *     responses:
 *       200:
 *         description: Thông tin doanh nghiệp
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Business'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền truy cập
 *       404:
 *         description: Không tìm thấy doanh nghiệp
 */
router.get('/:id', authenticateToken, authorizeBusinessAccess, getBusinessById);

/**
 * @swagger
 * /businesses:
 *   post:
 *     summary: Tạo doanh nghiệp mới
 *     description: |
 *       Chỉ superadmin và admin mới có quyền tạo doanh nghiệp.
 *       Business KHÔNG thể tạo doanh nghiệp, chỉ có thể xem doanh nghiệp của mình.
 *     tags: [Business]
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
 *               - ownerId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Tên doanh nghiệp
 *               ownerId:
 *                 type: string
 *                 description: ID chủ sở hữu
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
 *               subscription:
 *                 type: object
 *                 properties:
 *                   plan: { type: string, enum: ['starter', 'professional', 'vip'] }
 *     responses:
 *       201:
 *         description: Tạo doanh nghiệp thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Business'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo doanh nghiệp (chỉ superadmin/admin)
 */
router.post('/', authenticateToken, authorizeRoles(['superadmin', 'admin']), createBusiness);

/**
 * @swagger
 * /businesses/{id}:
 *   put:
 *     summary: Cập nhật thông tin doanh nghiệp
 *     description: |
 *       Chỉ superadmin và admin mới có quyền cập nhật doanh nghiệp.
 *       Business KHÔNG thể cập nhật doanh nghiệp, chỉ có thể xem.
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
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
 *               subscription:
 *                 type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Business'
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật (chỉ superadmin/admin)
 *       404:
 *         description: Không tìm thấy doanh nghiệp
 */
router.put('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), authorizeBusinessAccess, updateBusiness);

/**
 * @swagger
 * /businesses/{id}/status:
 *   patch:
 *     summary: Cập nhật trạng thái doanh nghiệp
 *     description: Chỉ superadmin và admin mới có quyền cập nhật
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
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
 *                 description: Trạng thái doanh nghiệp
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật
 */
router.patch('/:id/status', authenticateToken, authorizeRoles(['superadmin', 'admin']), updateBusinessStatus);

/**
 * @swagger
 * /businesses/{id}:
 *   delete:
 *     summary: Xóa doanh nghiệp
 *     description: Chỉ superadmin và admin mới có quyền xóa
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền xóa
 *       404:
 *         description: Không tìm thấy doanh nghiệp
 */
router.delete('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), deleteBusiness);

/**
 * @swagger
 * /businesses/{id}/subscription:
 *   patch:
 *     summary: Cập nhật gói đăng ký của doanh nghiệp
 *     description: Superadmin, admin và business có quyền cập nhật
 *     tags: [Business]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID doanh nghiệp
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - package
 *             properties:
 *               package:
 *                 type: string
 *                 enum: [basic, premium, enterprise]
 *                 description: Gói đăng ký mới
 *     responses:
 *       200:
 *         description: Cập nhật gói đăng ký thành công
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật
 */
router.patch('/:id/subscription', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business']), updateSubscription);

module.exports = router;
