const axios = require('axios');
const mongoose = require('mongoose');

// Import models
require('../models/paymentHistory');
require('../models/pricingPackage');
require('../models/users');

// Get models from mongoose
const PaymentHistory = mongoose.model('PaymentHistory');
const PricingPackage = mongoose.model('PricingPackage');
const User = mongoose.model('User');

// PayPal API Configuration
const PAYPAL_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const PAYPAL_PRODUCTION_BASE = 'https://api-m.paypal.com';

exports.getConfig = async (req, res) => {
    try {
        const clientId = process.env.PAYPAL_CLIENT_ID || '';
        const sandbox = process.env.PAYPAL_SANDBOX !== 'false';
        if (!clientId) {
            return res.status(500).json({ error: 'PayPal Client ID is not configured' });
        }
        return res.json({ clientId, sandbox });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to load PayPal config' });
    }
};

/**
 * Lấy PayPal access token
 */
const getPayPalAccessToken = async (sandbox = true) => {
    const baseUrl = sandbox ? PAYPAL_SANDBOX_BASE : PAYPAL_PRODUCTION_BASE;
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials not configured');
    }

    try {
        const response = await axios.post(
            `${baseUrl}/v1/oauth2/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                auth: {
                    username: clientId,
                    password: clientSecret
                }
            }
        );

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting PayPal access token:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Tạo PayPal order
 * POST /paypal/create-order
 */
exports.createOrder = async (req, res) => {
    try {
        const { packageId, userId, billingType, amount, currency = 'USD' } = req.body;

        if (!packageId || !userId || !billingType || !amount) {
            return res.status(400).json({
                error: 'Thiếu thông tin cần thiết',
                required: ['packageId', 'userId', 'billingType', 'amount']
            });
        }

        // Kiểm tra package và user
        const pkg = await PricingPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ error: 'Không tìm thấy gói dịch vụ' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        const sandbox = process.env.PAYPAL_SANDBOX !== 'false';
        const baseUrl = sandbox ? PAYPAL_SANDBOX_BASE : PAYPAL_PRODUCTION_BASE;
        const accessToken = await getPayPalAccessToken(sandbox);

        const billingTypeText = billingType === 'yearly' ? 'theo năm' : 'theo tháng';
        const orderDescription = `Đăng ký gói ${pkg.name} - ${billingTypeText}`;

        // Tạo PayPal order
        const orderData = {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: `package_${packageId}_${Date.now()}`,
                description: orderDescription,
                amount: {
                    currency_code: currency,
                    value: amount.toString()
                },
                custom_id: JSON.stringify({
                    packageId,
                    userId,
                    billingType
                })
            }],
            application_context: {
                brand_name: 'Hotel Management System',
                landing_page: 'BILLING',
                user_action: 'PAY_NOW',
                return_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/pricing?paymentStatus=success&paymentMethod=paypal`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/pricing?paymentStatus=cancel&paymentMethod=paypal`
            }
        };

        const response = await axios.post(
            `${baseUrl}/v2/checkout/orders`,
            orderData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            }
        );

        // Lưu payment history
        const paymentHistory = new PaymentHistory({
            userId,
            packageId,
            paymentMethod: 'paypal',
            amount: parseFloat(amount),
            currency,
            status: 'pending',
            transactionId: response.data.id,
            paypalOrderId: response.data.id,
            billingType,
            paymentGatewayResponse: response.data
        });
        await paymentHistory.save();

        res.json({
            success: true,
            orderId: response.data.id,
            approvalUrl: response.data.links?.find(link => link.rel === 'approve')?.href,
            paymentHistoryId: paymentHistory._id
        });
    } catch (error) {
        console.error('Error creating PayPal order:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Lỗi khi tạo PayPal order',
            detail: error.response?.data || error.message
        });
    }
};

/**
 * Capture PayPal payment
 * POST /paypal/capture-order
 */
exports.captureOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ error: 'Thiếu orderId' });
        }

        const sandbox = process.env.PAYPAL_SANDBOX !== 'false';
        const baseUrl = sandbox ? PAYPAL_SANDBOX_BASE : PAYPAL_PRODUCTION_BASE;
        const accessToken = await getPayPalAccessToken(sandbox);

        // Capture order
        const response = await axios.post(
            `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
            {},
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            }
        );

        // Cập nhật payment history
        const paymentHistory = await PaymentHistory.findOne({ paypalOrderId: orderId });
        if (paymentHistory) {
            paymentHistory.status = response.data.status === 'COMPLETED' ? 'completed' : 'failed';
            paymentHistory.paypalPayerId = response.data.payer?.payer_id;
            paymentHistory.paymentGatewayResponse = response.data;
            paymentHistory.completedAt = new Date();
            await paymentHistory.save();
        }

        res.json({
            success: response.data.status === 'COMPLETED',
            status: response.data.status,
            paymentHistory: paymentHistory ? {
                id: paymentHistory._id,
                userId: paymentHistory.userId,
                packageId: paymentHistory.packageId,
                amount: paymentHistory.amount,
                status: paymentHistory.status
            } : null,
            data: response.data
        });
    } catch (error) {
        console.error('Error capturing PayPal order:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Lỗi khi capture PayPal order',
            detail: error.response?.data || error.message
        });
    }
};

/**
 * Lấy lịch sử thanh toán PayPal
 * GET /paypal/payment-history
 */
exports.getPaymentHistory = async (req, res) => {
    try {
        const { userId, status, limit = 50, skip = 0 } = req.query;

        const query = { paymentMethod: 'paypal' };
        if (userId) {
            query.userId = userId;
        }
        if (status) {
            query.status = status;
        }

        const payments = await PaymentHistory.find(query)
            .populate('userId', 'username email')
            .populate('packageId', 'name price')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await PaymentHistory.countDocuments(query);

        res.json({
            success: true,
            data: payments,
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });
    } catch (error) {
        console.error('Error getting PayPal payment history:', error);
        res.status(500).json({
            error: 'Lỗi khi lấy lịch sử thanh toán PayPal',
            detail: error.message
        });
    }
};

