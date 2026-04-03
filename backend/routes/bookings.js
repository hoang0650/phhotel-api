var express = require('express');
var router = express.Router();
const { 
  calculateRoomCost,
  getBookingAndRoomDetails,
  createBooking,
  confirmBooking,
  checkin,
  checkout,
  getAllBookings,
  getBookingById,
  cancelBooking 
} = require('../controllers/bookings');

/* Các routes cho đặt phòng */
// Lấy tất cả bookings
router.get('/', getAllBookings);

// Lấy danh sách đặt phòng theo khách sạn
router.get('/hotel/:hotelId', getAllBookings);

// Lấy chi tiết booking
router.get('/:bookingId', getBookingById);

// Tạo booking mới
router.post('/', createBooking);

// Xác nhận booking
router.put('/:bookingId/confirm', confirmBooking);

// Check-in
router.put('/:bookingId/checkin', checkin);

// Check-out
router.put('/:bookingId/checkout', checkout);

// Hủy booking
router.put('/:bookingId/cancel', cancelBooking);

// Tính giá phòng
router.post('/calculate-cost/:bookingId', calculateRoomCost);

module.exports = router;