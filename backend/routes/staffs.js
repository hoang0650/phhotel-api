var express = require('express');
var router = express.Router();
const { 
    getAllStaff, 
    getStaff, 
    getStaffById, 
    createStaff, 
    updateStaff, 
    deleteStaff,
    calculateSalary,
    paySalary,
    getPayrollRecords
} = require('../controllers/staffs');

// Lấy tất cả nhân viên
router.get('/', getAllStaff);

// Lấy nhân viên theo khách sạn
router.get('/hotel/:hotelId', getStaff);

// IMPORTANT: Route này PHẢI đặt trước /:id 
// Nếu không, /staffs/payroll sẽ bị coi là /staffs/:id với id="payroll"
router.get('/payroll', getPayrollRecords);

// Lấy nhân viên theo ID
router.get('/:id', getStaffById);

// Tạo nhân viên mới
router.post('/', createStaff);

// Cập nhật nhân viên
router.put('/:id', updateStaff);

// Xóa nhân viên
router.delete('/:id', deleteStaff);

// Tính lương cho nhân viên (chỉ tính, không lưu)
router.post('/:staffId/calculate-salary', calculateSalary);

// Lưu lương vào payroll và đánh dấu đã thanh toán
router.post('/:staffId/pay-salary', paySalary);

module.exports = router;
