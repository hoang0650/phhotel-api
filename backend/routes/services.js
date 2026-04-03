const express = require('express');
const router = express.Router();
const { 
  createService, 
  updateService, 
  deleteService, 
  getServiceById, 
  getServices, 
  getServiceCategories,
  createServiceOrder,
  updateServiceOrderStatus,
  getServiceOrderById,
  getServiceOrdersByRoom,
  getServiceOrdersByHotel,
  deleteServiceOrder,
  assignServiceToHotel,
  bulkAssignServicesToHotel,
  getServicesForCheckout,
  calculateServiceTotal,
  getAvailableServicesForModal
} = require('../controllers/services');
const { 
  authenticateToken, 
  authorizeRoles,
  authorizeHotelAccess 
} = require('../middlewares/auth');

// ==========================================
// ROUTES KHÔNG CÓ PARAM (ĐẶT TRƯỚC /:id)
// ==========================================

/**
 * @swagger
 * /services:
 *   get:
 *     summary: Lấy danh sách dịch vụ
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: ID của khách sạn
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Danh mục dịch vụ
 *     responses:
 *       200:
 *         description: Danh sách dịch vụ
 */
router.get('/', authenticateToken, getServices);

// Lấy danh mục dịch vụ
router.get('/categories', authenticateToken, getServiceCategories);

// Lấy dịch vụ có sẵn cho modal
router.get('/available', authenticateToken, getAvailableServicesForModal);

// ======= Assign dịch vụ vào khách sạn =======
router.post('/assign', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), assignServiceToHotel);
router.post('/bulk-assign', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), bulkAssignServicesToHotel);

// ======= Tính tiền dịch vụ =======
router.post('/calculate-total', authenticateToken, calculateServiceTotal);

// ======= Quản lý đơn hàng dịch vụ =======
// POST /services/orders - Tạo đơn hàng
router.post('/orders', authenticateToken, createServiceOrder);

// GET /services/orders/hotel - Lấy đơn hàng theo khách sạn (phải đặt trước /orders/:id)
router.get('/orders/hotel', authenticateToken, getServiceOrdersByHotel);

// GET /services/orders/room/:roomId - Lấy đơn hàng theo phòng
router.get('/orders/room/:roomId', authenticateToken, getServiceOrdersByRoom);

// PATCH /services/orders/:id/status - Cập nhật trạng thái đơn hàng
router.patch('/orders/:id/status', authenticateToken, updateServiceOrderStatus);

// GET /services/orders/:id - Lấy đơn hàng theo ID
router.get('/orders/:id', authenticateToken, getServiceOrderById);

// DELETE /services/orders/:id - Xóa đơn hàng
router.delete('/orders/:id', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), deleteServiceOrder);

// ======= Lấy dịch vụ cho checkout =======
router.get('/checkout/:bookingId', authenticateToken, getServicesForCheckout);

// ==========================================
// ROUTES CRUD CÓ PARAM /:id (ĐẶT CUỐI CÙNG)
// ==========================================

/**
 * @swagger
 * /services:
 *   post:
 *     summary: Tạo dịch vụ mới
 */
router.post('/', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), createService);

/**
 * @swagger
 * /services/{id}:
 *   get:
 *     summary: Lấy dịch vụ theo ID
 */
router.get('/:id', authenticateToken, getServiceById);

/**
 * @swagger
 * /services/{id}:
 *   put:
 *     summary: Cập nhật dịch vụ
 */
router.put('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), updateService);

/**
 * @swagger
 * /services/{id}:
 *   delete:
 *     summary: Xóa dịch vụ
 */
router.delete('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel']), deleteService);

module.exports = router;
