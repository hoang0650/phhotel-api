const express = require('express');
const router = express.Router();
const financialSummaryController = require('../controllers/financialSummaryController');
const { authenticateToken } = require('../middlewares/auth');

// Lấy báo cáo tổng hợp tài chính
router.get('/', authenticateToken, financialSummaryController.getFinancialSummary);

// Cập nhật vốn đầu tư ban đầu
router.patch('/initial-investment/:hotelId', authenticateToken, financialSummaryController.updateInitialInvestment);

// Cập nhật cấu hình tài chính
router.patch('/financial-config/:hotelId', authenticateToken, financialSummaryController.updateFinancialConfig);

// Export báo cáo ra Excel
router.get('/export-excel', authenticateToken, financialSummaryController.exportFinancialSummaryToExcel);

module.exports = router;

