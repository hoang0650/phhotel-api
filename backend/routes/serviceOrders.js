var express = require('express');
var router = express.Router();
const { 
  getAllServiceOrders,
  getServiceOrdersByRoom,
  getServiceOrdersByBooking,
  createServiceOrder,
  updateServiceOrderStatus,
  payServiceOrder,
  cancelServiceOrder
} = require('../controllers/serviceOrders');

/* Các routes cho đơn hàng dịch vụ */
// Lấy tất cả đơn hàng dịch vụ theo khách sạn
router.get('/hotel/:hotelId', getAllServiceOrders);

// Lấy đơn hàng dịch vụ theo phòng
router.get('/room/:roomId', getServiceOrdersByRoom);

// Lấy đơn hàng dịch vụ theo booking
router.get('/booking/:bookingId', getServiceOrdersByBooking);

// Tạo đơn hàng dịch vụ mới
router.post('/', createServiceOrder);

// Cập nhật trạng thái đơn hàng
router.patch('/:orderId/status', updateServiceOrderStatus);

// Thanh toán đơn hàng
router.post('/:orderId/pay', payServiceOrder);

// Hủy đơn hàng
router.patch('/:orderId/cancel', cancelServiceOrder);

module.exports = router; 