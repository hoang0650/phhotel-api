const axios = require('axios');
const mongoose = require('mongoose');
const { PaymentHistory } = require('../models/paymentHistory');
const PricingPackage = require('../models/pricingPackage');
const { User } = require('../models/users');
const { Settings } = require('../models/settings');
// SePay SDK NodeJS
let SePayPgClient;
try {
  const sepayModule = require('sepay-pg-node');
  // Thử cả 2 cách import (có thể là default export hoặc named export)
  SePayPgClient = sepayModule.SePayPgClient || sepayModule.default?.SePayPgClient || sepayModule.default || sepayModule;
  if (typeof SePayPgClient !== 'function') {
    console.warn('SePayPgClient không phải là function, có thể SDK chưa được cài đặt đúng');
    SePayPgClient = null;
  }
} catch (error) {
  console.warn('sepay-pg-node chưa được cài đặt hoặc có lỗi:', error.message);
  console.warn('Chạy: npm install sepay-pg-node');
  SePayPgClient = null;
}

// SePay OAuth2 Configuration
const SEPAY_OAUTH2_BASE_URL = 'https://my.sepay.vn';
const SEPAY_OAUTH2_API_BASE = 'https://my.sepay.vn/api/v1';
const SEPAY_OAUTH2_AUTHORIZE_URL = 'https://my.sepay.vn/oauth/authorize';
const SEPAY_OAUTH2_TOKEN_URL = 'https://my.sepay.vn/oauth/token';

// Legacy API URLs (giữ lại để tương thích)
const SEPAY_API_URL = 'https://my.sepay.vn/userapi/transactions/list';
const SEPAY_LOGIN_URLS = [
  'https://my.sepay.vn/api/login',
  'https://my.sepay.vn/userapi/login',
  'https://my.sepay.vn/api/auth/login',
  'https://my.sepay.vn/userapi/auth/login'
];

/**
 * Legacy login (giữ lại để tương thích)
 * POST /sepay/auth
 */
exports.sepayLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    }

    const loginBody = { username, password };

    let lastError = null;
    for (const url of SEPAY_LOGIN_URLS) {
      try {
        const response = await axios.post(url, loginBody, {
          headers: { 'Content-Type': 'application/json' }
        });
        // Nếu trả về JSON có token, trả về luôn
        if (response.data && (response.data.token || response.data.access_token)) {
          return res.json({ token: response.data.token || response.data.access_token });
        }
        // Nếu trả về JSON nhưng không có token, thử endpoint tiếp theo
        if (typeof response.data === 'object') {
          lastError = { error: 'Không tìm thấy token trong response', detail: response.data };
          continue;
        }
        // Nếu trả về HTML, báo lỗi rõ ràng
        if (typeof response.data === 'string' && response.data.includes('<html')) {
          lastError = { error: 'Endpoint này trả về HTML, không phải API login', url };
          continue;
        }
      } catch (err) {
        lastError = { error: 'Lỗi khi gọi endpoint', url, detail: err?.response?.data || err.message };
        continue;
      }
    }
    // Nếu thử hết mà không thành công
    return res.status(400).json(lastError || { error: 'Không tìm thấy endpoint API login phù hợp' });
  } catch (error) {
    res.status(500).json({
      error: 'Lỗi đăng nhập SePay',
      detail: error?.response?.data || error.message
    });
  }
};

/**
 * OAuth2: Tạo authorization URL để redirect user đến SePay
 * GET /sepay/oauth2/authorize
 */
exports.getOAuth2AuthorizeUrl = async (req, res) => {
  try {
    const { client_id, redirect_uri, scope, state } = req.query;
    
    if (!client_id || !redirect_uri) {
      return res.status(400).json({
        error: 'Thiếu client_id hoặc redirect_uri',
        hint: 'Cần cung cấp client_id và redirect_uri để tạo authorization URL'
      });
    }

    // Tạo authorization URL
    const scopes = scope || 'bank-account:read transaction:read profile company';
    const stateValue = state || `state_${Date.now()}`;
    
    const authUrl = `${SEPAY_OAUTH2_AUTHORIZE_URL}?` +
      `response_type=code&` +
      `client_id=${encodeURIComponent(client_id)}&` +
      `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${encodeURIComponent(stateValue)}`;

    res.json({
      authorization_url: authUrl,
      state: stateValue
    });
  } catch (error) {
    console.error('Error creating OAuth2 authorization URL:', error);
    res.status(500).json({
      error: 'Lỗi khi tạo authorization URL',
      detail: error.message
    });
  }
};

/**
 * OAuth2: Đổi authorization code lấy access token
 * POST /sepay/oauth2/token
 */
exports.exchangeOAuth2Token = async (req, res) => {
  try {
    const { code, client_id, client_secret, redirect_uri } = req.body;

    if (!code || !client_id || !client_secret || !redirect_uri) {
      return res.status(400).json({
        error: 'Thiếu thông tin cần thiết',
        required: ['code', 'client_id', 'client_secret', 'redirect_uri']
      });
    }

    // Đổi authorization code lấy access token
    const qs = require('querystring');
    const tokenData = qs.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirect_uri,
      client_id: client_id,
      client_secret: client_secret
    });

    const response = await axios.post(SEPAY_OAUTH2_TOKEN_URL, tokenData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (response.data && response.data.access_token) {
      res.json({
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        scope: response.data.scope,
        expires_at: response.data.expires_in 
          ? new Date(Date.now() + response.data.expires_in * 1000)
          : null
      });
    } else {
      res.status(400).json({
        error: 'Không nhận được access token từ SePay',
        detail: response.data
      });
    }
  } catch (error) {
    console.error('Error exchanging OAuth2 token:', error);
    res.status(error.response?.status || 500).json({
      error: 'Lỗi khi đổi authorization code lấy access token',
      detail: error.response?.data || error.message
    });
  }
};

/**
 * OAuth2: Refresh access token
 * POST /sepay/oauth2/refresh
 */
exports.refreshOAuth2Token = async (req, res) => {
  try {
    const { refresh_token, client_id, client_secret } = req.body;

    if (!refresh_token || !client_id || !client_secret) {
      return res.status(400).json({
        error: 'Thiếu thông tin cần thiết',
        required: ['refresh_token', 'client_id', 'client_secret']
      });
    }

    const qs = require('querystring');
    const tokenData = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refresh_token,
      client_id: client_id,
      client_secret: client_secret
    });

    const response = await axios.post(SEPAY_OAUTH2_TOKEN_URL, tokenData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (response.data && response.data.access_token) {
      res.json({
        success: true,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token || refresh_token, // SePay có thể trả về refresh token mới
        token_type: response.data.token_type || 'Bearer',
        expires_in: response.data.expires_in,
        expires_at: response.data.expires_in 
          ? new Date(Date.now() + response.data.expires_in * 1000)
          : null
      });
    } else {
      res.status(400).json({
        error: 'Không nhận được access token mới từ SePay',
        detail: response.data
      });
    }
  } catch (error) {
    console.error('Error refreshing OAuth2 token:', error);
    res.status(error.response?.status || 500).json({
      error: 'Lỗi khi refresh access token',
      detail: error.response?.data || error.message
    });
  }
};

/**
 * OAuth2: Lấy thông tin người dùng hiện tại
 * GET /sepay/oauth2/me
 */
exports.getOAuth2UserInfo = async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Thiếu Access Token' });
    }

    const response = await axios.get(`${SEPAY_OAUTH2_API_BASE}/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(error.response?.status || 500).json({
      error: 'Lỗi khi lấy thông tin người dùng',
      detail: error.response?.data || error.message
    });
  }
};

/**
 * OAuth2: Lấy danh sách tài khoản ngân hàng
 * GET /sepay/oauth2/bank-accounts
 */
exports.getOAuth2BankAccounts = async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Thiếu Access Token' });
    }

    const response = await axios.get(`${SEPAY_OAUTH2_API_BASE}/bank-accounts`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    res.json({
      data: response.data.data || response.data,
      total: response.data.meta?.total || (Array.isArray(response.data) ? response.data.length : 0)
    });
  } catch (error) {
    console.error('Error getting bank accounts:', error);
    res.status(error.response?.status || 500).json({
      error: 'Lỗi khi lấy danh sách tài khoản ngân hàng',
      detail: error.response?.data || error.message
    });
  }
};

/**
 * Lấy giao dịch SePay sử dụng OAuth2 API
 * GET /sepay/transactions
 * Sử dụng OAuth2 access token từ header Authorization
 */
exports.getSepayTransactions = async (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
    if (!token) {
      return res.status(401).json({ 
        error: 'Thiếu Access Token SePay OAuth2. Vui lòng cung cấp token.',
        hint: 'Gửi token trong header: Authorization: Bearer YOUR_TOKEN'
      });
    }

    // Log token để debug (chỉ hiển thị một phần)
    const tokenPreview = token.length > 20 ? `${token.substring(0, 20)}...` : token;
    console.log(`[SePay] Request transactions với token: ${tokenPreview}`);

    // Lấy params filter/search/pagination từ query
    const {
      date_from,
      date_to,
      status,
      bankName,
      search,
      page = 1,
      pageSize = 10,
      bank_account_id // Filter theo tài khoản ngân hàng cụ thể
    } = req.query;

    // Sử dụng OAuth2 API endpoint
    const apiUrl = `${SEPAY_OAUTH2_API_BASE}/transactions`;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // Chuẩn bị query params cho OAuth2 API
    const params = {};
    if (date_from) params.date_from = date_from;
    if (date_to) params.date_to = date_to;
    if (status) params.status = status;
    if (bankName) params.bank_name = bankName;
    if (bank_account_id) params.bank_account_id = bank_account_id;
    if (search) params.search = search;
    if (page) params.page = page;
    if (pageSize) params.per_page = pageSize; // OAuth2 API có thể dùng per_page thay vì pageSize

    console.log(`[SePay] Gọi API: ${apiUrl}`);
    console.log(`[SePay] Params:`, params);

    // Gọi SePay OAuth2 API
    let response;
    try {
      response = await axios.get(apiUrl, { 
        headers, 
        params,
        timeout: 30000
      });
      console.log(`[SePay] API Response Status: ${response.status}`);
    } catch (err) {
      const errorData = err.response?.data || {};
      const errorStatus = err.response?.status;
      
      console.error('[SePay] OAuth2 API Error:', {
        status: errorStatus,
        error: errorData.error || err.message,
        message: errorData.message,
        hint: errorData.hint,
        url: apiUrl,
        headers: {
          'Authorization': `Bearer ${tokenPreview}...`,
          'Content-Type': headers['Content-Type'],
          'Accept': headers['Accept']
        },
        params: params
      });
      
      // Nếu lỗi 401, token có thể đã hết hạn hoặc không hợp lệ
      if (errorStatus === 401) {
        return res.status(401).json({
          error: errorData.error || 'Access Token không hợp lệ hoặc đã hết hạn',
          message: errorData.message || 'Vui lòng refresh token hoặc đăng nhập lại qua OAuth2.',
          hint: errorData.hint || 'Access token could not be verified',
          statusCode: 401,
          detail: errorData
        });
      }

      return res.status(errorStatus || 500).json({
        error: 'Lỗi khi kết nối đến SePay OAuth2 API',
        message: errorData.message || err.message,
        detail: errorData.error || errorData,
        statusCode: errorStatus || 500
      });
    }
    
    // Xử lý response từ SePay OAuth2 API
    // Format OAuth2 API: { data: [...], meta: { total, page, per_page } }
    let transactions = [];
    let total = 0;

    if (response.data) {
      // Format OAuth2: { data: [...] }
      if (response.data.data && Array.isArray(response.data.data)) {
        transactions = response.data.data;
        total = response.data.meta?.total || response.data.total || transactions.length;
      }
      // Format: Array trực tiếp
      else if (Array.isArray(response.data)) {
        transactions = response.data;
        total = transactions.length;
      }
      // Format legacy: { transactions: [...] }
      else if (response.data.transactions && Array.isArray(response.data.transactions)) {
        transactions = response.data.transactions;
        total = response.data.total || transactions.length;
      }
    }

    // Filter thủ công nếu API không hỗ trợ filter
    if (date_from && transactions.length > 0) {
      transactions = transactions.filter(t => {
        const txDate = t.transaction_date || t.date || t.created_at;
        return txDate && new Date(txDate) >= new Date(date_from);
      });
    }
    if (date_to && transactions.length > 0) {
      transactions = transactions.filter(t => {
        const txDate = t.transaction_date || t.date || t.created_at;
        return txDate && new Date(txDate) <= new Date(date_to + 'T23:59:59');
      });
    }
    if (status && transactions.length > 0) {
      transactions = transactions.filter(t => (t.status || '').toLowerCase() === status.toLowerCase());
    }
    if (bankName && transactions.length > 0) {
      transactions = transactions.filter(t => {
        const bank = t.bank_brand_name || t.bank_name || t.bank?.name || '';
        return bank.toLowerCase().includes(bankName.toLowerCase());
      });
    }
    if (search && transactions.length > 0) {
      const s = search.trim().toLowerCase();
      transactions = transactions.filter(t =>
        (t.transaction_content || t.description || t.content || '').toLowerCase().includes(s) ||
        (t.reference_number || t.reference || '').toLowerCase().includes(s) ||
        (t.account_number || t.account || '').toLowerCase().includes(s)
      );
    }

    // Phân trang nếu API không hỗ trợ
    if (!response.data.meta && transactions.length > 0) {
      const pageInt = parseInt(page) || 1;
      const pageSizeInt = parseInt(pageSize) || 10;
      const start = (pageInt - 1) * pageSizeInt;
      const end = start + pageSizeInt;
      transactions = transactions.slice(start, end);
      total = transactions.length;
    }

    res.json({ 
      data: transactions, 
      total: total || transactions.length,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 10
    });
  } catch (error) {
    console.error('Error getting SePay transactions:', error);
    res.status(error?.response?.status || 500).json({
      error: 'Lỗi khi lấy giao dịch SePay',
      detail: error.message
    });
  }
};

// ============ TẠO FORM THANH TOÁN SEPAY ============

/**
 * Tạo signature cho form thanh toán SePay
 * @param {Object} fields - Các trường của form
 * @param {String} secretKey - Secret key từ merchant
 * @returns {String} Signature đã được mã hóa base64
 */
/**
 * Tạo mã thanh toán SePay theo cấu trúc
 * Format: PHG + số nguyên (3-8 ký tự)
 * Ví dụ: PHG11111111
 */
const generateSePayPaymentCode = (prefix = 'PHG', minLength = 6, maxLength = 8) => {
  // Tạo số ngẫu nhiên từ 3-8 ký tự (ưu tiên 6-8 để đảm bảo unique)
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  // Tạo số ngẫu nhiên với độ dài đã chọn
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const randomNumber = Math.floor(Math.random() * (max - min + 1)) + min;
  
  return `${prefix}${randomNumber}`;
};

const createSePaySignature = (fields, secretKey) => {
  const crypto = require('crypto');
  
  // Các trường được phép ký (theo đúng thứ tự trong tài liệu)
  const signedFields = [
    'merchant',
    'operation',
    'payment_method',
    'order_amount',
    'currency',
    'order_invoice_number',
    'order_description',
    'customer_id',
    'success_url',
    'error_url',
    'cancel_url'
  ];

  // Lọc các trường được phép ký và tạo chuỗi ký
  // Chỉ thêm các trường có giá trị (không rỗng) vào signature
  const signedValues = [];
  signedFields.forEach(field => {
    // Chỉ thêm vào signature nếu có giá trị và không rỗng
    if (fields[field] !== undefined && fields[field] !== null && fields[field] !== '') {
      signedValues.push(`${field}=${fields[field]}`);
    }
  });

  // Tạo chuỗi ký: field1=value1,field2=value2,...
  const signedString = signedValues.join(',');

  // Log để debug (chỉ trong development)
  if (process.env.NODE_ENV !== 'production') {
    console.log('SePay Signature String:', signedString);
    console.log('SePay Signed Fields:', signedValues);
  }

  // Tạo HMAC-SHA256 hash
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(signedString);
  const hash = hmac.digest();

  // Encode base64
  const signature = hash.toString('base64');
  
  // Log signature để debug
  if (process.env.NODE_ENV !== 'production') {
    console.log('SePay Generated Signature:', signature);
  }
  
  return signature;
};

/**
 * Tạo form thanh toán SePay
 * POST /sepay/create-payment
 * Sử dụng SDK SePay NodeJS nếu có, nếu không thì fallback về manual signature
 */
exports.createPayment = async (req, res) => {
  try {
    const { fields, paymentData } = req.body;

    // Validate paymentData để tạo payment history
    if (!paymentData || !paymentData.packageId || !paymentData.userId || !paymentData.billingType) {
      return res.status(400).json({
        error: 'Thiếu thông tin thanh toán',
        required: ['packageId', 'userId', 'billingType', 'amount']
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(paymentData.packageId) || !mongoose.Types.ObjectId.isValid(paymentData.userId)) {
      return res.status(400).json({ error: 'packageId hoặc userId không hợp lệ' });
    }

    // Kiểm tra package và user tồn tại
    const package = await PricingPackage.findById(paymentData.packageId);
    if (!package) {
      return res.status(404).json({ error: 'Không tìm thấy gói dịch vụ' });
    }

    const user = await User.findById(paymentData.userId);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Lấy config SePay từ environment variables
    const sepayConfig = {
      merchant: process.env.SEPAY_MERCHANT_ID,
      secretKey: process.env.SEPAY_SECRET_KEY,
      sandbox: process.env.SEPAY_SANDBOX !== 'false' // Mặc định sandbox nếu không set
    };

    // Kiểm tra cấu hình - chỉ lấy từ environment variables
    if (!sepayConfig.merchant || sepayConfig.merchant.trim() === '') {
      return res.status(400).json({
        error: 'SePay chưa được cấu hình. Vui lòng cấu hình SEPAY_MERCHANT_ID trong environment variables.',
        message: 'Xem hướng dẫn tại: nest/backend/SEPAY_SETUP_GUIDE.md',
        hint: 'Thêm SEPAY_MERCHANT_ID=your_merchant_id vào file .env'
      });
    }

    if (!sepayConfig.secretKey || sepayConfig.secretKey.trim() === '') {
      return res.status(400).json({
        error: 'SePay Secret Key chưa được cấu hình. Vui lòng cấu hình SEPAY_SECRET_KEY trong environment variables.',
        message: 'Xem hướng dẫn tại: nest/backend/SEPAY_SETUP_GUIDE.md',
        hint: 'Thêm SEPAY_SECRET_KEY=your_secret_key vào file .env'
      });
    }

    // Sử dụng SDK SePay nếu có
    if (SePayPgClient) {
      try {
        // Khởi tạo SePay client
        const client = new SePayPgClient({
          env: sepayConfig.sandbox ? 'sandbox' : 'production',
          merchant_id: sepayConfig.merchant,
          secret_key: sepayConfig.secretKey
        });

        // Lấy checkout URL từ SDK
        const checkoutUrl = client.checkout.initCheckoutUrl();

        // Chuẩn bị dữ liệu cho form fields
        // Chỉ truyền các trường có giá trị, không truyền trường rỗng
        const paymentFields = {
          operation: fields.operation || 'PURCHASE',
          order_invoice_number: fields.order_invoice_number,
          order_amount: parseInt(fields.order_amount) || 0,
          currency: fields.currency || 'VND',
          order_description: fields.order_description || ''
        };

        // Chỉ thêm các trường optional nếu có giá trị
        if (fields.payment_method && fields.payment_method.trim() !== '') {
          paymentFields.payment_method = fields.payment_method;
        }
        if (fields.customer_id && fields.customer_id.trim() !== '') {
          paymentFields.customer_id = fields.customer_id;
        }
        if (fields.success_url && fields.success_url.trim() !== '') {
          paymentFields.success_url = fields.success_url;
        }
        if (fields.error_url && fields.error_url.trim() !== '') {
          paymentFields.error_url = fields.error_url;
        }
        if (fields.cancel_url && fields.cancel_url.trim() !== '') {
          paymentFields.cancel_url = fields.cancel_url;
        }
        if (fields.custom_data && fields.custom_data.trim() !== '') {
          paymentFields.custom_data = fields.custom_data;
        }

        // Tạo form fields với signature từ SDK
        const checkoutFormFields = client.checkout.initOneTimePaymentFields(paymentFields);

    // Log để debug (chỉ trong development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('SePay SDK - Payment Fields Input:', JSON.stringify(paymentFields, null, 2));
      console.log('SePay SDK - Form Fields Output:', JSON.stringify(checkoutFormFields, null, 2));
      console.log('SePay SDK - Checkout URL:', checkoutUrl);
    }

    // Tạo payment history với status 'pending' để webhook có thể tìm thấy
    // Tạo mã thanh toán theo cấu trúc SePay: PHG + số nguyên (3-8 ký tự)
    const orderInvoiceNumber = fields.order_invoice_number || generateSePayPaymentCode('PHG', 6, 8);
    const paymentHistory = new PaymentHistory({
      userId: paymentData.userId,
      packageId: paymentData.packageId,
      paymentMethod: 'sepay',
      amount: parseInt(fields.order_amount) || paymentData.amount || 0,
      currency: fields.currency || paymentData.currency || 'VND',
      status: 'pending',
      billingType: paymentData.billingType,
      sepayInvoiceNumber: orderInvoiceNumber,
      metadata: {
        orderDescription: fields.order_description || paymentData.description,
        customerId: fields.customer_id || paymentData.customerId
      }
    });
    await paymentHistory.save();
    console.log('Created SePay payment history (pending):', paymentHistory._id);

    res.status(200).json({
      success: true,
      merchant: sepayConfig.merchant,
      signature: checkoutFormFields.signature,
      checkoutUrl: checkoutUrl,
      fields: checkoutFormFields,
      paymentHistoryId: paymentHistory._id
    });
    return;
      } catch (sdkError) {
        console.error('Error using SePay SDK:', sdkError);
        console.error('SDK Error Details:', {
          message: sdkError.message,
          stack: sdkError.stack,
          name: sdkError.name
        });
        // Fallback về manual signature nếu SDK có lỗi
      }
    }

    // Fallback: Sử dụng manual signature (code cũ)
    // Thêm merchant vào fields
    const formFields = {
      ...fields,
      merchant: sepayConfig.merchant
    };

    // Log để debug (chỉ trong development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('SePay Manual - Form Fields:', JSON.stringify(formFields, null, 2));
    }

    // Tạo signature thủ công
    const signature = createSePaySignature(formFields, sepayConfig.secretKey);

    // Xác định checkout URL
    const checkoutUrl = sepayConfig.sandbox
      ? 'https://pay-sandbox.sepay.vn/v1/checkout/init'
      : 'https://pay.sepay.vn/v1/checkout/init';

    // Log signature để debug (chỉ trong development)
    if (process.env.NODE_ENV !== 'production') {
      console.log('SePay Manual - Signature:', signature);
      console.log('SePay Manual - Checkout URL:', checkoutUrl);
    }

    // Tạo payment history với status 'pending' để webhook có thể tìm thấy
    // Tạo mã thanh toán theo cấu trúc SePay: PHG + số nguyên (3-8 ký tự)
    const orderInvoiceNumber = fields.order_invoice_number || generateSePayPaymentCode('PHG', 6, 8);
    const paymentHistory = new PaymentHistory({
      userId: paymentData.userId,
      packageId: paymentData.packageId,
      paymentMethod: 'sepay',
      amount: parseInt(fields.order_amount) || paymentData.amount || 0,
      currency: fields.currency || paymentData.currency || 'VND',
      status: 'pending',
      billingType: paymentData.billingType,
      sepayInvoiceNumber: orderInvoiceNumber,
      metadata: {
        orderDescription: fields.order_description || paymentData.description,
        customerId: fields.customer_id || paymentData.customerId
      }
    });
    await paymentHistory.save();
    console.log('Created SePay payment history (pending):', paymentHistory._id);

    res.status(200).json({
      success: true,
      merchant: sepayConfig.merchant,
      signature: signature,
      checkoutUrl: checkoutUrl,
      fields: formFields,
      paymentHistoryId: paymentHistory._id
    });
  } catch (error) {
    console.error('Error creating SePay payment:', error);
    res.status(500).json({
      error: 'Lỗi khi tạo form thanh toán SePay',
      message: error.message
    });
  }
};

/**
 * Xử lý callback từ SePay (IPN - Instant Payment Notification)
 * POST /sepay/callback
 */
exports.handleCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    
    // Xác thực signature từ callback
    const sepayConfig = {
      secretKey: process.env.SEPAY_SECRET_KEY
    };

    if (!sepayConfig.secretKey || sepayConfig.secretKey.trim() === '') {
      return res.status(400).json({
        error: 'SePay Secret Key chưa được cấu hình. Vui lòng cấu hình SEPAY_SECRET_KEY trong environment variables.'
      });
    }

    // TODO: Xác thực signature và xử lý kết quả thanh toán
    // Cập nhật trạng thái đơn hàng trong database
    
    console.log('SePay callback received:', callbackData);

    // Trả về response cho SePay
    res.status(200).json({
      success: true,
      message: 'Callback received'
    });
  } catch (error) {
    console.error('Error handling SePay callback:', error);
    res.status(500).json({
      error: 'Lỗi khi xử lý callback từ SePay',
      message: error.message
    });
  }
};

/**
 * Xử lý webhook từ SePay
 * POST /hooks/sepay-payment
 * Theo tài liệu: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('SePay Webhook received:', JSON.stringify(webhookData, null, 2));

    // Xác thực webhook (nếu có API Key)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Apikey ')) {
      const apiKey = authHeader.replace('Apikey ', '');
      // TODO: Validate API Key nếu cần
      console.log('Webhook API Key:', apiKey);
    }

    // Validate dữ liệu webhook
    if (!webhookData.id || !webhookData.transferType || !webhookData.transferAmount) {
      console.warn('Webhook thiếu thông tin bắt buộc:', webhookData);
      return res.status(400).json({
        success: false,
        error: 'Thiếu thông tin bắt buộc'
      });
    }

    // Chỉ xử lý giao dịch tiền vào (transferType = "in")
    if (webhookData.transferType !== 'in') {
      console.log('Webhook không phải giao dịch tiền vào, bỏ qua');
      return res.status(200).json({
        success: true,
        message: 'Không phải giao dịch tiền vào'
      });
    }

    // Chống trùng lặp: Kiểm tra xem giao dịch đã được xử lý chưa
    // Sử dụng id hoặc kết hợp referenceCode, transferType, transferAmount
    const existingPayment = await PaymentHistory.findOne({
      $or: [
        { transactionId: webhookData.id.toString() },
        {
          sepayOrderId: webhookData.referenceCode,
          status: 'completed'
        }
      ]
    });

    if (existingPayment && existingPayment.status === 'completed') {
      console.log('Giao dịch đã được xử lý trước đó:', webhookData.id);
      return res.status(200).json({
        success: true,
        message: 'Giao dịch đã được xử lý'
      });
    }

    // Parse code để lấy thông tin packageId, userId, billingType
    // Code có format: PHG + số nguyên (3-8 ký tự), ví dụ: PHG11111111
    let packageId = null;
    let userId = null;
    let billingType = 'monthly';
    let orderInvoiceNumber = null;

    // Code format mới: PHG + số nguyên (ví dụ: PHG11111111)
    // Không còn chứa packageId trong code, cần tìm từ payment history
    if (webhookData.code) {
      // Kiểm tra xem code có format PHG + số không
      const phgMatch = webhookData.code.match(/^PHG(\d{3,8})$/);
      if (phgMatch) {
        // Code hợp lệ theo format PHG + số
        orderInvoiceNumber = webhookData.code;
      } else {
        // Fallback: sử dụng code trực tiếp
        orderInvoiceNumber = webhookData.code;
      }
    }

    // Tìm payment history dựa trên transferAmount (ưu tiên) hoặc code/referenceCode
    let paymentHistory = null;
    
    // ƯU TIÊN 1: Tìm theo transferAmount (so sánh với amount trong payment history)
    // Cho phép sai số 1% để xử lý làm tròn
    const transferAmount = parseFloat(webhookData.transferAmount);
    const tolerance = transferAmount * 0.01; // 1% tolerance
    
    paymentHistory = await PaymentHistory.findOne({
      paymentMethod: 'sepay',
      status: 'pending',
      amount: { 
        $gte: transferAmount - tolerance, 
        $lte: transferAmount + tolerance 
      }
    }).sort({ createdAt: -1 }); // Lấy payment gần nhất
    
    // Nếu không tìm thấy theo amount, thử tìm theo sepayInvoiceNumber (code)
    if (!paymentHistory && webhookData.code) {
      paymentHistory = await PaymentHistory.findOne({
        sepayInvoiceNumber: webhookData.code,
        paymentMethod: 'sepay',
        status: { $in: ['pending', 'completed'] }
      });
    }

    // Nếu vẫn không tìm thấy, thử tìm theo sepayOrderId (referenceCode)
    if (!paymentHistory && webhookData.referenceCode) {
      paymentHistory = await PaymentHistory.findOne({
        sepayOrderId: webhookData.referenceCode,
        paymentMethod: 'sepay',
        status: { $in: ['pending', 'completed'] }
      });
    }

    // Nếu tìm thấy payment history, lấy thông tin từ đó
    if (paymentHistory) {
      packageId = paymentHistory.packageId?.toString() || packageId;
      userId = paymentHistory.userId?.toString() || userId;
      billingType = paymentHistory.billingType || 'monthly';
      orderInvoiceNumber = paymentHistory.sepayInvoiceNumber || webhookData.code || orderInvoiceNumber;
      const roomId = paymentHistory.roomId?.toString();
      const paymentType = paymentHistory.metadata?.paymentType;
      
      // Nếu payment history đã completed, kiểm tra duplicate
      if (paymentHistory.status === 'completed') {
        console.log('Payment history đã completed, có thể là duplicate webhook');
        // Vẫn trả về success nhưng không xử lý lại
        return res.status(200).json({
          success: true,
          message: 'Giao dịch đã được xử lý trước đó'
        });
      }
      
      // Kiểm tra số tiền có khớp không (so sánh transferAmount với amount)
      const expectedAmount = parseFloat(paymentHistory.amount);
      const receivedAmount = parseFloat(webhookData.transferAmount);
      const amountDifference = Math.abs(receivedAmount - expectedAmount);
      const amountTolerance = expectedAmount * 0.01; // Cho phép sai số 1%
      
      if (amountDifference > amountTolerance) {
        console.warn('Số tiền không khớp:', {
          expected: expectedAmount,
          received: receivedAmount,
          difference: amountDifference,
          tolerance: amountTolerance
        });
        // Vẫn trả về success nhưng log warning (có thể do phí giao dịch)
      }
      
      // Nếu là checkout phòng, cập nhật payment status và trả về
      if (paymentType === 'room_checkout' && roomId) {
        // Cập nhật payment history
        paymentHistory.status = 'completed';
        paymentHistory.transactionId = webhookData.id.toString();
        paymentHistory.paymentGatewayResponse = webhookData;
        paymentHistory.completedAt = new Date(webhookData.transactionDate || Date.now());
        paymentHistory.amount = receivedAmount; // Cập nhật số tiền thực tế từ webhook
        await paymentHistory.save();
        
        // Cập nhật payment status của room checkout
        const { Room } = require('../models/rooms');
        const RoomEvent = require('../models/roomEvent');
        const room = await Room.findById(roomId);
        if (room) {
          // Cập nhật RoomEvent checkout gần nhất (ưu tiên)
          const latestCheckoutEvent = await RoomEvent.findOne({
            roomId: roomId,
            type: 'checkout',
            paymentStatus: 'pending'
          }).sort({ checkoutTime: -1 });
          
          if (latestCheckoutEvent) {
            latestCheckoutEvent.paymentStatus = 'paid';
            latestCheckoutEvent.paymentTransactionId = webhookData.id.toString();
            await latestCheckoutEvent.save();
            console.log('Updated RoomEvent checkout payment status to paid:', latestCheckoutEvent._id);
          }
          
          // Cập nhật room.events (backward compatibility)
          if (room.events && room.events.length > 0) {
            const checkoutEvents = room.events.filter(e => e.type === 'checkout');
            if (checkoutEvents.length > 0) {
              const lastCheckout = checkoutEvents[checkoutEvents.length - 1];
              if (lastCheckout.paymentMethod === 'transfer' && lastCheckout.paymentStatus === 'pending') {
                lastCheckout.paymentStatus = 'paid';
                lastCheckout.paymentTransactionId = webhookData.id.toString();
                await room.save();
                console.log('Updated room.events checkout payment status to paid:', roomId);
              }
            }
          }
          
          // Cập nhật trạng thái phòng thành 'dirty' nếu chưa có
          if (room.status !== 'dirty') {
            room.status = 'dirty';
            await room.save();
            console.log('Updated room status to dirty after payment:', roomId);
          }
        }
        
        return res.status(201).json({
          success: true,
          message: 'Webhook processed successfully for room checkout',
          transactionId: webhookData.id,
          roomId: roomId
        });
      }
    } else if (packageId) {
      // Nếu có packageId từ code nhưng chưa có payment history
      // Cần tìm userId từ customer_id trong webhook hoặc từ content
      // Thử parse userId từ customer_id nếu có
      if (webhookData.customer_id || webhookData.customerId) {
        userId = webhookData.customer_id || webhookData.customerId;
      }
      
      console.log('Tìm thấy packageId từ code nhưng chưa có payment history:', {
        packageId,
        userId,
        code: webhookData.code,
        referenceCode: webhookData.referenceCode
      });
    }

    // Nếu không tìm thấy thông tin cần thiết, chỉ lưu webhook data
    if (!packageId || !userId) {
      console.warn('Không tìm thấy packageId hoặc userId từ webhook:', {
        code: webhookData.code,
        referenceCode: webhookData.referenceCode,
        content: webhookData.content
      });
      
      // Vẫn trả về success để SePay không retry
      return res.status(200).json({
        success: true,
        message: 'Webhook received nhưng không có thông tin đăng ký gói'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId) || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error('Invalid ObjectId:', { packageId, userId });
      return res.status(400).json({
        success: false,
        error: 'Invalid packageId or userId'
      });
    }

    // Kiểm tra package và user
    const package = await PricingPackage.findById(packageId);
    if (!package) {
      console.error('Package not found:', packageId);
      return res.status(404).json({
        success: false,
        error: 'Package not found'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Kiểm tra số tiền có khớp không (so sánh transferAmount với amount)
    const expectedAmount = paymentHistory ? parseFloat(paymentHistory.amount) : (package.monthlyPrice || package.price || 0);
    const receivedAmount = parseFloat(webhookData.transferAmount);
    const amountDifference = Math.abs(receivedAmount - expectedAmount);
    const amountTolerance = expectedAmount * 0.01; // Cho phép sai số 1%

    if (amountDifference > amountTolerance) {
      console.warn('Số tiền không khớp:', {
        expected: expectedAmount,
        received: receivedAmount,
        difference: amountDifference,
        tolerance: amountTolerance
      });
      // Nếu không có payment history và số tiền không khớp, không xử lý
      if (!paymentHistory) {
        return res.status(200).json({
          success: false,
          message: 'Số tiền không khớp với gói dịch vụ',
          expected: expectedAmount,
          received: receivedAmount
        });
      }
      // Nếu có payment history nhưng số tiền không khớp, vẫn xử lý nhưng log warning
    }

    // Cập nhật hoặc tạo payment history
    if (paymentHistory) {
      // Cập nhật payment history
      paymentHistory.status = 'completed';
      paymentHistory.transactionId = webhookData.id.toString();
      paymentHistory.paymentGatewayResponse = webhookData;
      paymentHistory.completedAt = new Date(webhookData.transactionDate || Date.now());
      paymentHistory.amount = receivedAmount; // Cập nhật số tiền thực tế
      await paymentHistory.save();
      console.log('Updated payment history:', paymentHistory._id);
    } else {
      // Tạo payment history mới
      paymentHistory = new PaymentHistory({
        userId: userId,
        packageId: packageId,
        paymentMethod: 'sepay',
        amount: receivedAmount,
        currency: 'VND',
        status: 'completed',
        transactionId: webhookData.id.toString(),
        paymentGatewayResponse: webhookData,
        billingType: billingType,
        sepayOrderId: webhookData.referenceCode,
        sepayInvoiceNumber: orderInvoiceNumber || webhookData.code,
        completedAt: new Date(webhookData.transactionDate || Date.now())
      });
      await paymentHistory.save();
      console.log('Created new payment history:', paymentHistory._id);
    }

    // Đăng ký gói cho user (chỉ khi có packageId)
    if (packageId) {
      try {
        // Tính thời hạn dựa trên billingType
        let subscriptionDuration = package.duration;
        if (billingType === 'yearly') {
          subscriptionDuration = 12;
        } else if (billingType === 'monthly') {
          subscriptionDuration = 1;
        }

        // Cập nhật thông tin gói cho user
        user.pricingPackage = packageId;
        user.packageExpiryDate = new Date(Date.now() + subscriptionDuration * 30 * 24 * 60 * 60 * 1000);
        user.billingType = billingType;
        user.paymentInfo = {
          paymentId: webhookData.id.toString(),
          paymentMethod: 'sepay',
          paymentDate: new Date(webhookData.transactionDate || Date.now())
        };
        await user.save();

        console.log('Successfully subscribed user to package:', {
          userId,
          packageId,
          billingType,
          expiryDate: user.packageExpiryDate
        });

        try {
          const toEmail = user.email;
          let emailSettings = null;
          try {
            const settingsDoc = await Settings.findOne();
            emailSettings = settingsDoc?.emailSettings || null;
          } catch (e) {
            emailSettings = null;
          }
          const { sendEmailTemplate, sendEmail: sendEmailAdapter, EMAIL_PROVIDER } = require('../config/emailServiceAdapter');
          const provider = (emailSettings?.emailProvider || process.env.EMAIL_PROVIDER || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
          const templateId = emailSettings?.resendTemplateSubscriptionId || emailSettings?.resendTemplateSubscriptionAlias || process.env.RESEND_TEMPLATE_SUBSCRIPTION_SUCCESS_ID || process.env.RESEND_TEMPLATE_SUBSCRIPTION_ALIAS;
          const fromEmail = emailSettings?.emailFrom || process.env.EMAIL_FROM || '';
          if (toEmail) {
            if (provider === 'resend' && templateId) {
              const price = (billingType === 'yearly' ? package.yearlyPrice : package.monthlyPrice) ?? package.monthlyPrice ?? 0;
              const backendUrl = process.env.BACKEND_PUBLIC_URL || process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
              const logoUrl = `${backendUrl}/images/phgroup_logo_circle.PNG`;
              const dashboardUrl = `${process.env.APP_URL || 'http://localhost:4200'}/admin/pricing-management`;
              const variables = {
                appName: process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel',
                userName: user.username || user.email || '',
                packageName: package.name || '',
                price: typeof price === 'number' ? `${price.toLocaleString('vi-VN')} VND` : `${price}`,
                startDate: (user.paymentInfo?.paymentDate ? new Date(user.paymentInfo.paymentDate) : new Date()).toLocaleString('vi-VN'),
                expireDate: new Date(user.packageExpiryDate).toLocaleString('vi-VN'),
                logoUrl,
                dashboardUrl
              };
              const overrides = { from: fromEmail, subject: 'Đăng ký gói thành công' };
              await sendEmailTemplate(toEmail, templateId, variables, overrides, emailSettings || undefined);
            } else {
              const subject = 'Đăng ký gói thành công';
              const appName = process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel';
              const dashboardUrl = `${process.env.APP_URL || 'http://localhost:4200'}/admin/room`;
              const backendUrl = process.env.BACKEND_PUBLIC_URL || process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
              const logoUrl = `${backendUrl}/images/phgroup_logo_circle.PNG`;
              const priceStr = (billingType === 'yearly' ? package.yearlyPrice : package.monthlyPrice) ?? package.monthlyPrice ?? 0;
              const priceDisplay = typeof priceStr === 'number' ? `${priceStr.toLocaleString('vi-VN')} VND` : `${priceStr}`;
              const html = `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
                  <div style="text-align:center; padding: 24px 0;">
                    <img src="${logoUrl}" alt="${appName}" style="width:48px;height:48px;border-radius:12px;display:block;margin:0 auto 8px auto;" />
                    <div style="font-size: 14px; color: #64748b;">${appName}</div>
                  </div>
                  <div style="text-align:center; margin-bottom: 12px; color:#16a34a;">
                    <span style="font-size:16px;">🪄 Đăng ký gói thành công</span>
                  </div>
                  <div style="margin-top:16px; font-size:15px; line-height:1.6;">
                    <p>Chào <strong>${user.username || user.email}</strong>,</p>
                    <p>Bạn đã đăng ký thành công gói dịch vụ sau:</p>
                  </div>
                  <div style="background:#f1f5f9; border-radius:12px; padding:16px; font-size:14px;">
                    <div>📦 Gói: <strong>${package.name || ''}</strong></div>
                    <div>💰 Giá: <strong>${priceDisplay}</strong></div>
                    <div>🗓️ Bắt đầu: <strong>${(user.paymentInfo?.paymentDate ? new Date(user.paymentInfo.paymentDate) : new Date()).toLocaleString('vi-VN')}</strong></div>
                    <div>⏳ Hết hạn: <strong>${new Date(user.packageExpiryDate).toLocaleString('vi-VN')}</strong></div>
                  </div>
                  <div style="text-align:center; margin: 28px 0;">
                    <a href="${dashboardUrl}" style="background-color:#1a73e8; color:#ffffff; padding: 12px 20px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600;">Truy cập Dashboard</a>
                  </div>
                  <div style="text-align:center; margin-top:8px; font-size:12px; color:#64748b;">
                    © ${appName}
                  </div>
                </div>
              `;
              const text = `Đăng ký gói thành công

Gói: ${package.name}
Giá: ${priceDisplay}
Bắt đầu: ${(user.paymentInfo?.paymentDate ? new Date(user.paymentInfo.paymentDate) : new Date()).toLocaleString('vi-VN')}
Hết hạn: ${new Date(user.packageExpiryDate).toLocaleString('vi-VN')}

Truy cập Dashboard: ${dashboardUrl}

© ${appName}`;
              await sendEmailAdapter(toEmail, subject, html, text, fromEmail, emailSettings || undefined);
            }
          }
        } catch (emailError) {
          console.warn('Warning: Unable to send subscription success email (SePay webhook):', emailError.message);
        }
      } catch (subscribeError) {
        console.error('Error subscribing user to package:', subscribeError);
        // Vẫn trả về success để SePay không retry, nhưng log lỗi
      }
    }

    // Trả về response thành công cho SePay
    // Theo tài liệu: {"success": true} với HTTP Status 200 hoặc 201
    res.status(201).json({
      success: true,
      message: 'Webhook processed successfully',
      transactionId: webhookData.id
    });

  } catch (error) {
    console.error('Error handling SePay webhook:', error);
    // Trả về lỗi để SePay có thể retry
    res.status(500).json({
      success: false,
      error: 'Lỗi khi xử lý webhook',
      message: error.message
    });
  }
};

/**
 * Helper function: Lấy QR code từ superadmin hoặc settings
 * Ưu tiên: superadmin > settings
 * Tất cả các user bất kể role đều có thể sử dụng QR code này
 * Chỉ dùng cho pricing payment (packageId)
 */
async function getSystemQRCode() {
  try {
    console.log('[getSystemQRCode] Starting to get QR code from system...');
    
    // Bước 1: Ưu tiên lấy từ superadmin
    const superadmins = await User.find({ role: 'superadmin', status: { $ne: 'deleted' } }).limit(1);
    console.log('[getSystemQRCode] Found superadmins:', superadmins?.length || 0);
    
    if (superadmins && superadmins.length > 0) {
      const superadmin = superadmins[0];
      const qrUrl = superadmin?.bankAccount?.qrPaymentUrl || '';
      const beneficiaryName = superadmin?.bankAccount?.beneficiaryName || superadmin?.bankAccount?.accountHolderName || '';
      const bankName = superadmin?.bankAccount?.bankName || '';
      const accountNumber = superadmin?.bankAccount?.accountNumber || '';
      
      console.log('[getSystemQRCode] Superadmin QR URL:', qrUrl ? 'Found' : 'Not found');
      
      if (qrUrl) {
        console.log('[getSystemQRCode] Returning QR code from superadmin');
        return {
          qrPaymentUrl: qrUrl,
          beneficiaryName: beneficiaryName,
          bankName: bankName,
          accountNumber: accountNumber,
          source: 'superadmin'
        };
      }
    }
    
    // Bước 2: Nếu không có từ superadmin, thử lấy từ settings
    console.log('[getSystemQRCode] Trying to get QR code from settings...');
    const settings = await Settings.findOne();
    console.log('[getSystemQRCode] Settings found:', !!settings);
    
    if (settings) {
      const settingsData = settings.toObject();
      const paymentSettings = settingsData.paymentSettings || settingsData.bankAccount;
      const qrUrl = paymentSettings?.qrPaymentUrl || '';
      const beneficiaryName = paymentSettings?.beneficiaryName || paymentSettings?.accountHolderName || '';
      const bankName = paymentSettings?.bankName || '';
      const accountNumber = paymentSettings?.accountNumber || '';
      
      console.log('[getSystemQRCode] Settings QR URL:', qrUrl ? 'Found' : 'Not found');
      
      if (qrUrl) {
        console.log('[getSystemQRCode] Returning QR code from settings');
        return {
          qrPaymentUrl: qrUrl,
          beneficiaryName: beneficiaryName,
          bankName: bankName,
          accountNumber: accountNumber,
          source: 'settings'
        };
      }
    }
    
    // Không tìm thấy QR code
    console.log('[getSystemQRCode] No QR code found in system');
    return null;
  } catch (error) {
    console.error('[getSystemQRCode] Error getting system QR code:', error);
    return null;
  }
}

/**
 * Tạo payment history cho SePay (không redirect đến SePay)
 * POST /sepay/create-payment-history
 * Tạo payment history với mã PHG và trả về thông tin thanh toán
 * 
 * Logic:
 * - Nếu có packageId (pricing payment): lấy QR code từ superadmin/settings và trả về
 * - Nếu có roomId (room payment): không trả về QR code (frontend tự lấy như cũ)
 */
exports.createPaymentHistory = async (req, res) => {
  try {
    const { packageId, userId, billingType, amount, currency = 'VND', orderInvoiceNumber, description, roomId, roomNumber } = req.body;

    // Validate input - packageId là optional (có thể là checkout phòng)
    if (!userId || !amount) {
      return res.status(400).json({
        error: 'Thiếu thông tin thanh toán',
        required: ['userId', 'amount']
      });
    }

    // Validate ObjectId cho userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'userId không hợp lệ' });
    }

    // Validate ObjectId cho packageId nếu có
    if (packageId && !mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(400).json({ error: 'packageId không hợp lệ' });
    }

    // Kiểm tra user tồn tại
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra package tồn tại nếu có packageId
    let package = null;
    let packageName = description || 'Thanh toán dịch vụ';
    if (packageId) {
      package = await PricingPackage.findById(packageId);
      if (!package) {
        return res.status(404).json({ error: 'Không tìm thấy gói dịch vụ' });
      }
      packageName = package.name;
    }

    // Tạo mã thanh toán nếu chưa có
    const paymentCode = orderInvoiceNumber || generateSePayPaymentCode('PHG', 6, 8);

    // Tạo payment history với status 'pending'
    const paymentHistoryData = {
      userId: userId,
      paymentMethod: 'sepay',
      amount: parseFloat(amount),
      currency: currency,
      status: 'pending',
      sepayInvoiceNumber: paymentCode,
      metadata: {
        description: description || packageName,
        customerId: userId
      }
    };

    // Thêm packageId nếu có (cho subscription)
    if (packageId) {
      paymentHistoryData.packageId = packageId;
      paymentHistoryData.billingType = billingType || 'monthly';
    }

    // Thêm roomId nếu có (cho checkout phòng)
    if (roomId) {
      paymentHistoryData.roomId = roomId;
      paymentHistoryData.metadata.roomNumber = roomNumber;
      paymentHistoryData.metadata.paymentType = 'room_checkout';
    }

    const paymentHistory = new PaymentHistory(paymentHistoryData);
    await paymentHistory.save();

    console.log('Created SePay payment history (pending):', paymentHistory._id);

    // Chuẩn bị response
    const response = {
      success: true,
      paymentHistoryId: paymentHistory._id,
      paymentCode: paymentCode,
      amount: parseFloat(amount),
      currency: currency,
      packageName: packageName,
      billingType: billingType || null,
      message: `Vui lòng chuyển khoản ${parseFloat(amount).toLocaleString('vi-VN')} ${currency}`
    };

    // Xác định loại payment
    const isPricingPayment = !!packageId;
    const isRoomPayment = !!roomId;
    const isEInvoicePayment = !packageId && !roomId;

    console.log('[createPaymentHistory] Payment type:', {
      isPricingPayment,
      isRoomPayment,
      isEInvoicePayment,
      packageId: packageId || 'none',
      roomId: roomId || 'none'
    });

    // Nếu là pricing payment hoặc e-invoice payment, lấy QR code từ hệ thống
    if (isPricingPayment || isEInvoicePayment) {
      console.log('[createPaymentHistory] Getting QR code from system for', isPricingPayment ? 'pricing' : 'e-invoice', 'payment...');
      const qrCodeInfo = await getSystemQRCode();
      
      console.log('[createPaymentHistory] QR code info result:', {
        hasQrCodeInfo: !!qrCodeInfo,
        qrCodeInfoType: typeof qrCodeInfo,
        hasQrPaymentUrl: !!(qrCodeInfo && qrCodeInfo.qrPaymentUrl),
        qrPaymentUrlValue: qrCodeInfo?.qrPaymentUrl || 'undefined',
        source: qrCodeInfo?.source || 'none'
      });
      
      if (qrCodeInfo && qrCodeInfo.qrPaymentUrl) {
        console.log('[createPaymentHistory] QR code found from:', qrCodeInfo.source);
        response.qrPaymentUrl = qrCodeInfo.qrPaymentUrl;
        response.beneficiaryName = qrCodeInfo.beneficiaryName;
        response.bankName = qrCodeInfo.bankName;
        response.accountNumber = qrCodeInfo.accountNumber;
        response.qrCodeSource = qrCodeInfo.source;
        console.log('[createPaymentHistory] Added QR code to response');
      } else {
        console.log('[createPaymentHistory] No QR code found in system - returning error');
        console.log('[createPaymentHistory] qrCodeInfo:', JSON.stringify(qrCodeInfo, null, 2));
        // Chỉ trả về lỗi cho pricing và e-invoice payment (không phải room payment)
        return res.status(400).json({
          success: false,
          error: 'Chưa có QR code thanh toán trong hệ thống',
          message: 'Vui lòng liên hệ quản trị viên để cập nhật thông tin thanh toán',
          paymentHistoryId: paymentHistory._id
        });
      }
    }
    // Nếu là room payment, không lấy QR code và không trả về lỗi (frontend tự lấy từ hotel profile)
    else if (isRoomPayment) {
      console.log('[createPaymentHistory] Room payment - skipping QR code (frontend will get from hotel profile)');
    }
    
    console.log('[createPaymentHistory] Final response (before sending):', {
      success: response.success,
      hasQrPaymentUrl: !!response.qrPaymentUrl,
      paymentHistoryId: response.paymentHistoryId
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('Error creating SePay payment history:', error);
    res.status(500).json({
      error: 'Lỗi khi tạo payment history',
      message: error.message
    });
  }
};

/**
 * Lấy QR code thanh toán cho pricing payment (từ superadmin/settings)
 * GET /sepay/pricing-qr-code
 * Tất cả các user bất kể role đều có thể truy cập (chỉ cần đăng nhập)
 * QR code được lấy từ superadmin hoặc settings của hệ thống
 */
exports.getPricingQRCode = async (req, res) => {
  try {
    console.log('[getPricingQRCode] Request received');
    const qrCodeInfo = await getSystemQRCode();
    console.log('[getPricingQRCode] QR code info:', qrCodeInfo ? 'Found' : 'Not found');
    
    if (qrCodeInfo) {
      res.status(200).json({
        success: true,
        qrPaymentUrl: qrCodeInfo.qrPaymentUrl,
        beneficiaryName: qrCodeInfo.beneficiaryName,
        bankName: qrCodeInfo.bankName,
        accountNumber: qrCodeInfo.accountNumber,
        source: qrCodeInfo.source
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Chưa có QR code thanh toán trong hệ thống',
        message: 'Vui lòng liên hệ quản trị viên để cập nhật thông tin thanh toán'
      });
    }
  } catch (error) {
    console.error('[getPricingQRCode] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi khi lấy QR code thanh toán',
      message: error.message
    });
  }
};

/**
 * Lấy lịch sử thanh toán SePay từ PaymentHistory
 * GET /sepay/payment-history
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const { userId, status, limit = 50, skip = 0 } = req.query;

    const query = { paymentMethod: 'sepay' };
    if (userId) {
      query.userId = userId;
    }
    if (status) {
      query.status = status;
    }

    const payments = await PaymentHistory.find(query)
      .populate('userId', 'username email')
      .populate('packageId', 'name price monthlyPrice yearlyPrice')
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
    console.error('Error getting SePay payment history:', error);
    res.status(500).json({
      error: 'Lỗi khi lấy lịch sử thanh toán SePay',
      detail: error.message
    });
  }
};

exports.generatePaymentSound = async (req, res) => {
  try {
    const { message, speed, voice, format, callbackUrl } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.FPT_AI_TTS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'FPT AI TTS API key is not configured' });
    }

    const headers = {
      'api_key': apiKey,
      voice: voice || 'banmai',
      speed: typeof speed !== 'undefined' ? String(speed) : '0',
      format: format || 'mp3',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/plain'
    };
    if (callbackUrl) {
      headers['Callback-Url'] = callbackUrl;
    }
    const response = await axios.post('https://api.fpt.ai/hmi/tts/v5', message, {
      headers,
      timeout: 60000
    });

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error generating payment sound:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to generate payment sound',
      detail: error.response?.data || error.message
    });
  }
}; 

exports.fetchTtsFile = async (req, res) => {
  try {
    const { url } = req.query || {};
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only https URLs are allowed' });
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000
    });

    const contentType = response.headers['content-type'] || 'audio/mpeg';
    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching TTS file:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch TTS file',
      detail: error.response?.data || error.message
    });
  }
};
