var express = require('express');
var router = express.Router();
const { 
  getallRooms, 
  checkinRoom, 
  checkoutRoom, 
  cleanRoom, 
  getRoomById, 
  createRoom, 
  updateRoom, 
  deleteRoom,
  assignServiceToRoom,
  removeServiceFromRoom,
  getAvailableRooms,
  getRoomsByFloor,
  getHotelFloors,
  getRoomHistory,
  getInvoiceDetails,
  updateRoomStatus,
  transferRoom,
  createRoomBooking,
  cancelRoomBooking,
  getRoomBookings,
  guestOut,
  guestReturn,
  updateRoomCheckinInfo,
  getRoomEventsById,
  getEventsByHotelId,
  recheckinRoom,
  deleteCheckoutHistory,
  calculateCheckoutTotal
} = require('../controllers/rooms');
const { authenticateToken, authorizeRoles } = require('../middlewares/auth');

/**
 * @swagger
 * /rooms:
 *   get:
 *     summary: Lấy danh sách phòng
 *     description: |
 *       Phân quyền theo role:
 *       - Superadmin/Admin: Thấy tất cả phòng
 *       - Business: Chỉ thấy các phòng thuộc các khách sạn của businessId mình
 *       - Hotel Manager: Chỉ thấy các phòng thuộc hotelId của mình
 *       - Staff: Chỉ thấy các phòng thuộc hotelId của mình
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Lọc theo hotelId
 *       - in: query
 *         name: floor
 *         schema:
 *           type: number
 *         description: Lọc theo tầng
 *     responses:
 *       200:
 *         description: Danh sách phòng (đã được filter theo quyền)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Room'
 *   post:
 *     summary: Tạo phòng mới
 *     description: |
 *       Chỉ superadmin, admin và hotel manager có quyền tạo phòng.
 *       Business KHÔNG thể tạo phòng, chỉ có thể xem các phòng thuộc các khách sạn của mình.
 *       Hotel manager chỉ có thể tạo phòng cho khách sạn của mình (theo hotelId).
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomNumber
 *               - hotelId
 *               - type
 *             properties:
 *               roomNumber:
 *                 type: string
 *                 description: Số phòng
 *               hotelId:
 *                 type: string
 *                 description: ID khách sạn (hotel manager chỉ có thể tạo cho hotelId của mình)
 *               type:
 *                 type: string
 *                 description: Loại phòng
 *               floor:
 *                 type: number
 *                 description: Tầng
 *               pricing:
 *                 type: object
 *                 properties:
 *                   hourly: { type: number }
 *                   daily: { type: number }
 *                   nightly: { type: number }
 *               status:
 *                 type: string
 *                 enum: [vacant, occupied, cleaning, dirty, maintenance, booked]
 *                 default: vacant
 *     responses:
 *       201:
 *         description: Tạo phòng thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Room'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền tạo phòng (chỉ superadmin/admin/hotel manager)
 */
router.get('/', getallRooms);

/**
 * @swagger
 * /rooms/available:
 *   get:
 *     summary: Lấy danh sách phòng khả dụng
 *     tags: [Rooms]
 *     responses:
 *       200:
 *         description: Danh sách phòng khả dụng
 */
router.get('/available', getAvailableRooms);

// Route cho lịch sử phòng
router.get('/history', getRoomHistory);

// Route để lấy chi tiết hóa đơn
router.get('/invoice/:invoiceId', getInvoiceDetails);

/**
 * @swagger
 * /rooms/checkin/{id}:
 *   post:
 *     summary: Check-in phòng
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               guestInfo:
 *                 type: object
 *               checkinTime:
 *                 type: string
 *                 format: date-time
 *               rateType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Check-in thành công
 */
router.post('/checkin/:id', checkinRoom);

/**
 * @swagger
 * /rooms/checkout/{id}:
 *   post:
 *     summary: Check-out phòng
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethod:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Check-out thành công
 */
router.post('/checkout/:id', checkoutRoom);

// Tính toán tổng hợp checkout
router.post('/calculate-checkout-total', calculateCheckoutTotal);

// Dọn dẹp phòng
router.post('/clean/:id', cleanRoom);

// Cập nhật trạng thái phòng
router.patch('/:id/status', updateRoomStatus);

// Cập nhật thông tin khách và tiền đặt trước
router.patch('/:id/checkin-info', updateRoomCheckinInfo);

// Lấy events theo hotelId (đặt trước route /:id để tránh xung đột)
router.get('/events', getEventsByHotelId);

// Lấy events riêng từ RoomEvent collection (đặt trước route /:id để tránh xung đột)
router.get('/:id/events', getRoomEventsById);

// Chuyển phòng
router.post('/transfer', transferRoom);

// Đặt phòng trước
router.post('/booking', createRoomBooking);

// Lấy danh sách bookings
router.get('/bookings', getRoomBookings);

// Hủy đặt phòng
router.post('/booking/cancel/:roomId', cancelRoomBooking);

// Khách ra ngoài
router.post('/:roomId/guest-out', guestOut);

// Khách quay lại
router.post('/:roomId/guest-return', guestReturn);

// Check-in lại (undo checkout) - chỉ superadmin, admin, business
router.post('/recheckin', recheckinRoom);

// Xóa lịch sử checkout - chỉ superadmin
router.delete('/history', deleteCheckoutHistory);

// Routes cho phòng theo tầng
router.get('/hotel/:hotelId/floor/:floor', getRoomsByFloor);
router.get('/hotel/:hotelId/floors', getHotelFloors);

// Gán dịch vụ cho phòng
router.post('/:roomId/services/:serviceId', assignServiceToRoom);

// Xóa dịch vụ khỏi phòng
router.delete('/:roomId/services/:serviceId', removeServiceFromRoom);

// Lấy thông tin chi tiết phòng - đặt route này sau cùng để tránh xung đột
router.get('/:id', getRoomById);

/**
 * @swagger
 * /rooms/{id}:
 *   get:
 *     summary: Lấy thông tin chi tiết phòng theo ID
 *     tags: [Rooms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     responses:
 *       200:
 *         description: Thông tin phòng
 *       404:
 *         description: Không tìm thấy phòng
 *   put:
 *     summary: Cập nhật thông tin phòng
 *     description: |
 *       Chỉ superadmin, admin và hotel manager có quyền cập nhật phòng.
 *       Business KHÔNG thể cập nhật phòng, chỉ có thể xem.
 *       Hotel manager chỉ có thể cập nhật phòng thuộc khách sạn của mình (theo hotelId).
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roomNumber:
 *                 type: string
 *                 description: Số phòng
 *               type:
 *                 type: string
 *                 description: Loại phòng
 *               floor:
 *                 type: number
 *                 description: Tầng
 *               pricing:
 *                 type: object
 *                 properties:
 *                   hourly: { type: number }
 *                   daily: { type: number }
 *                   nightly: { type: number }
 *               status:
 *                 type: string
 *                 enum: [vacant, occupied, cleaning, dirty, maintenance, booked]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Room'
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền cập nhật (chỉ superadmin/admin/hotel manager)
 *       404:
 *         description: Không tìm thấy phòng
 *   delete:
 *     summary: Xóa phòng
 *     description: |
 *       Chỉ superadmin, admin và hotel manager có quyền xóa phòng.
 *       Business KHÔNG thể xóa phòng, chỉ có thể xem.
 *       Hotel manager chỉ có thể xóa phòng thuộc khách sạn của mình (theo hotelId).
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID phòng
 *     responses:
 *       200:
 *         description: Xóa phòng thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Xóa phòng thành công"
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không có quyền xóa (chỉ superadmin/admin/hotel manager)
 *       404:
 *         description: Không tìm thấy phòng
 */
router.post('/', authenticateToken, authorizeRoles(['superadmin', 'admin', 'hotel']), createRoom);
router.put('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin', 'hotel']), updateRoom);
router.delete('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin', 'hotel']), deleteRoom);

module.exports = router;