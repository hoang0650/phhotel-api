const express = require('express');
const router = express.Router();
const debtController = require('../controllers/debtController');
const { authenticateToken } = require('../middlewares/auth');

// ============ TẠO CÔNG NỢ ============
router.post('/', authenticateToken, debtController.createDebt);

// ============ LẤY DANH SÁCH CÔNG NỢ ============
router.get('/', authenticateToken, debtController.getDebts);

// ============ LẤY CHI TIẾT CÔNG NỢ ============
router.get('/:id', authenticateToken, debtController.getDebtById);

// ============ THANH TOÁN CÔNG NỢ ============
router.post('/:id/settle', authenticateToken, debtController.settleDebt);

// ============ XÓA CÔNG NỢ ============
router.delete('/:id', authenticateToken, debtController.deleteDebt);

// ============ CẬP NHẬT NHÃN CÔNG NỢ ============
router.patch('/:id/labels', authenticateToken, debtController.updateDebtLabels);

module.exports = router;

