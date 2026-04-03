var express = require('express');
var router = express.Router();
const { 
  getPriceConfigs,
  getPriceConfigByRoomType,
  createPriceConfig,
  updatePriceConfig,
  deactivatePriceConfig,
  calculateRoomPrice
} = require('../controllers/priceConfig');

/* Các routes cho cấu hình giá */
// Lấy tất cả cấu hình giá theo khách sạn
router.get('/hotel/:hotelId', getPriceConfigs);

// Lấy cấu hình giá theo loại phòng
router.get('/hotel/:hotelId/roomType/:roomTypeId', getPriceConfigByRoomType);

// Tạo cấu hình giá mới
router.post('/hotel/:hotelId', createPriceConfig);

// Cập nhật cấu hình giá
router.put('/:configId', updatePriceConfig);

// Vô hiệu hóa cấu hình giá
router.patch('/:configId/deactivate', deactivatePriceConfig);

// Tính giá phòng
router.post('/calculate', calculateRoomPrice);

module.exports = router; 