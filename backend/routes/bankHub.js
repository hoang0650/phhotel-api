const express = require('express');
const router = express.Router();
const bankHubController = require('../controllers/bankHubController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/status', authenticateToken, bankHubController.getStatus);
router.post('/link-token', authenticateToken, bankHubController.createLinkToken);
router.get('/bank-accounts', authenticateToken, bankHubController.getBankAccounts);
router.get('/transactions', authenticateToken, bankHubController.getTransactions);
router.post('/company', authenticateToken, bankHubController.createCompany);
router.get('/companies', authenticateToken, bankHubController.getCompanies);

module.exports = router;
