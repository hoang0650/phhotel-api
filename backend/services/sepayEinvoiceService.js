const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

// Đảm bảo .env được load từ đúng thư mục
const envPath = path.resolve(__dirname, '../.env');
console.log('[Sepay eInvoice] Loading .env from:', envPath);
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.error('[Sepay eInvoice] Error loading .env file:', envResult.error);
  console.error('[Sepay eInvoice] Trying to load from default location...');
  // Thử load từ default location
  dotenv.config();
} else {
  console.log('[Sepay eInvoice] .env file loaded successfully');
}

/**
 * Sepay eInvoice API Service
 * Tài liệu: https://developer.sepay.vn/vi/einvoice-api/tong-quan
 */

// Base URL cho môi trường Sandbox
const SEPAY_EINVOICE_BASE_URL = process.env.SEPAY_EINVOICE_BASE_URL || 'https://einvoice-api-sandbox.sepay.vn';

// Log để kiểm tra .env có được load không (chỉ log một lần khi module được load)
console.log('[Sepay eInvoice] Checking environment variables...');
console.log('[Sepay eInvoice] SEPAY_EINVOICE_USERNAME:', process.env.SEPAY_EINVOICE_USERNAME ? `${process.env.SEPAY_EINVOICE_USERNAME.substring(0, 10)}...` : 'NOT SET');
console.log('[Sepay eInvoice] SEPAY_EINVOICE_PASSWORD:', process.env.SEPAY_EINVOICE_PASSWORD ? '***' : 'NOT SET');
console.log('[Sepay eInvoice] SEPAY_EINVOICE_BASE_URL:', process.env.SEPAY_EINVOICE_BASE_URL || 'NOT SET (using default)');

if (!process.env.SEPAY_EINVOICE_USERNAME || !process.env.SEPAY_EINVOICE_PASSWORD) {
  console.error('[Sepay eInvoice] ERROR: SEPAY_EINVOICE_USERNAME or SEPAY_EINVOICE_PASSWORD not found in environment variables');
  console.error('[Sepay eInvoice] Please check your .env file in nest/backend/.env');
  console.error('[Sepay eInvoice] Make sure the file exists and contains:');
  console.error('[Sepay eInvoice]   SEPAY_EINVOICE_USERNAME=your_username');
  console.error('[Sepay eInvoice]   SEPAY_EINVOICE_PASSWORD=your_password');
} else {
  console.log('[Sepay eInvoice] Environment variables loaded successfully');
}

// Cache cho access token (global - dùng chung cho tất cả users)
let accessTokenCache = {
  token: null,
  expiresAt: null
};

// Cache cho access token theo user (key = userId)
let userTokenCache = new Map();

/**
 * Lấy access token từ Sepay
 * POST v1/token
 * @param {string} username - Username từ Sepay (optional, nếu không có thì dùng từ .env)
 * @param {string} password - Password từ Sepay (optional, nếu không có thì dùng từ .env)
 * @param {string} userId - User ID để cache token riêng (optional)
 */
async function getAccessToken(username = null, password = null, userId = null) {
  try {
    // Nếu có userId, kiểm tra cache token của user đó
    if (userId) {
      const userCache = userTokenCache.get(userId);
      console.log(`[Sepay eInvoice] Checking cache for user ${userId}:`, {
        hasCache: !!userCache,
        hasToken: !!(userCache && userCache.token),
        hasExpiresAt: !!(userCache && userCache.expiresAt),
        isExpired: userCache && userCache.expiresAt ? new Date() >= userCache.expiresAt : true,
        hasUsername: !!(userCache && userCache.username),
        hasPassword: !!(userCache && userCache.password)
      });
      
      if (userCache && userCache.token && userCache.expiresAt && new Date() < userCache.expiresAt) {
        console.log(`[Sepay eInvoice] Using cached token for user ${userId}`);
        return userCache.token;
      }
      // Nếu token hết hạn nhưng có username/password trong cache, sử dụng lại
      if (userCache && userCache.username && userCache.password) {
        console.log(`[Sepay eInvoice] Token expired for user ${userId}, refreshing with cached credentials`);
        username = username || userCache.username;
        password = password || userCache.password;
      } else if (!username || !password) {
        // Nếu có userId nhưng không có credentials trong cache, thử dùng global token trước
        console.log(`[Sepay eInvoice] No credentials in cache for user ${userId}, trying global token...`);
        if (accessTokenCache.token && accessTokenCache.expiresAt && new Date() < accessTokenCache.expiresAt) {
          console.log(`[Sepay eInvoice] Using cached global token as fallback for user ${userId}`);
          return accessTokenCache.token;
        }
        // Nếu global token cũng không có, thử dùng .env
        if (process.env.SEPAY_EINVOICE_USERNAME && process.env.SEPAY_EINVOICE_PASSWORD) {
          console.log(`[Sepay eInvoice] Using .env credentials as fallback for user ${userId}`);
          username = process.env.SEPAY_EINVOICE_USERNAME;
          password = process.env.SEPAY_EINVOICE_PASSWORD;
        } else {
          // Nếu không có gì cả, báo lỗi
          const error = new Error('Token đã hết hạn và không có thông tin đăng nhập. Vui lòng đăng nhập lại.');
          error.code = 'EINVOICE_TOKEN_EXPIRED';
          error.details = {
            message: 'Token của user đã hết hạn và không có thông tin đăng nhập trong cache. Vui lòng gọi API /e-invoice/login để đăng nhập lại.',
            userId: userId
          };
          throw error;
        }
      }
    } else {
      // Kiểm tra cache token global
      if (accessTokenCache.token && accessTokenCache.expiresAt && new Date() < accessTokenCache.expiresAt) {
        console.log(`[Sepay eInvoice] Using cached global token`);
        return accessTokenCache.token;
      }
      console.log(`[Sepay eInvoice] No cached global token, will try to get new token`);
    }

    // Sử dụng username/password từ tham số, từ cache, hoặc từ .env
    const finalUsername = username || process.env.SEPAY_EINVOICE_USERNAME;
    const finalPassword = password || process.env.SEPAY_EINVOICE_PASSWORD;

    console.log(`[Sepay eInvoice] Getting token with:`, {
      hasUsername: !!finalUsername,
      hasPassword: !!finalPassword,
      usernameFromParam: !!username,
      passwordFromParam: !!password,
      usernameFromEnv: !!process.env.SEPAY_EINVOICE_USERNAME,
      passwordFromEnv: !!process.env.SEPAY_EINVOICE_PASSWORD,
      userId: userId || 'null (global)',
      envUsernameValue: process.env.SEPAY_EINVOICE_USERNAME ? `${process.env.SEPAY_EINVOICE_USERNAME.substring(0, 10)}...` : 'NOT SET',
      envPasswordValue: process.env.SEPAY_EINVOICE_PASSWORD ? '***' : 'NOT SET'
    });

    if (!finalUsername || !finalPassword) {
      const error = new Error('Username và Password là bắt buộc');
      error.code = 'EINVOICE_CONFIG_MISSING';
      error.details = {
        message: userId 
          ? 'Token đã hết hạn và không có thông tin đăng nhập. Vui lòng đăng nhập lại qua API /e-invoice/login.'
          : (username || password 
            ? 'Username hoặc Password không được để trống'
            : 'Vui lòng cấu hình các biến môi trường sau trong file .env hoặc cung cấp username/password:'),
        required: [
          'SEPAY_EINVOICE_BASE_URL=https://einvoice-api-sandbox.sepay.vn',
          'SEPAY_EINVOICE_USERNAME=your_username',
          'SEPAY_EINVOICE_PASSWORD=your_password'
        ],
        documentation: 'Xem hướng dẫn tại: nest/backend/SEPAY_EINVOICE_SETUP.md',
        currentState: {
          hasEnvUsername: !!process.env.SEPAY_EINVOICE_USERNAME,
          hasEnvPassword: !!process.env.SEPAY_EINVOICE_PASSWORD,
          hasParamUsername: !!username,
          hasParamPassword: !!password,
          userId: userId || 'null'
        }
      };
      throw error;
    }

    // Sepay sử dụng Basic Authentication với username:password
    // Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/tao-token
    // Gửi request với body rỗng và Basic Auth header
    const authString = Buffer.from(`${finalUsername}:${finalPassword}`).toString('base64');
    
    const response = await axios.post(
      `${SEPAY_EINVOICE_BASE_URL}/v1/token`, 
      {}, // Body rỗng theo tài liệu
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        }
      }
    );

    // Xử lý response theo format của Sepay
    // Response format: { success: true, data: { access_token, token_type, expires_in } }
    if (response.data && response.data.success && response.data.data?.access_token) {
      const token = response.data.data.access_token;
      const expiresIn = response.data.data.expires_in || 86400; // Mặc định 24 giờ (86400 giây) theo tài liệu
      
      // Cache token với thời gian hết hạn (trừ 5 phút để đảm bảo an toàn)
      const expiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);
      
      if (userId) {
        // Cache token cho user cụ thể (lưu cả username/password để refresh token sau này)
        const existingCache = userTokenCache.get(userId) || {};
        userTokenCache.set(userId, {
          token,
          expiresAt,
          username: finalUsername,
          password: finalPassword // Lưu password để refresh token khi hết hạn
        });
        console.log(`[Sepay eInvoice] Token cached for user ${userId}, expires in ${expiresIn} seconds`);
      } else {
        // Cache token global
        accessTokenCache.token = token;
        accessTokenCache.expiresAt = expiresAt;
        console.log(`[Sepay eInvoice] Token cached (global), expires in ${expiresIn} seconds`);
      }
      
      return token;
    }

    // Xử lý lỗi từ response
    if (response.data && !response.data.success) {
      const errorMsg = response.data.error?.message || response.data.message || 'Không nhận được access token';
      throw new Error(`Sepay API Error: ${errorMsg}`);
    }

    throw new Error('Không nhận được access token từ Sepay eInvoice API. Response không đúng format.');
  } catch (error) {
    // Xử lý lỗi 401 Unauthorized (sai username/password)
    if (error.response && error.response.status === 401) {
      const errorMsg = new Error('Sai thông tin Username hoặc Password');
      errorMsg.code = 'EINVOICE_AUTH_FAILED';
      throw errorMsg;
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi gọi Sepay eInvoice API');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    
    console.error('Error getting Sepay eInvoice access token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Tạo request với authorization header
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {any} data - Request body data
 * @param {any} params - Query parameters
 * @param {string} userId - User ID để lấy token riêng (optional)
 */
async function makeAuthenticatedRequest(method, endpoint, data = null, params = null, userId = null) {
  try {
    console.log(`[Sepay eInvoice] Making ${method} request to ${endpoint} for user: ${userId || 'global'}`);
    const token = await getAccessToken(null, null, userId);
    
    if (!token) {
      throw new Error('Không thể lấy được access token');
    }
    
    console.log(`[Sepay eInvoice] Token obtained, length: ${token.length}`);
    
    const config = {
      method,
      url: `${SEPAY_EINVOICE_BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    if (params) {
      config.params = params;
    }

    const response = await axios(config);
    
    // Log response để debug
    console.log(`[Sepay eInvoice] Response status: ${response.status}`);
    console.log(`[Sepay eInvoice] Response data:`, JSON.stringify(response.data, null, 2));
    
    // Sepay API trả về format: { success: true/false, data: {...} hoặc error: {...} }
    return response.data;
  } catch (error) {
    // Log lỗi chi tiết
    console.error(`[Sepay eInvoice] Request error:`, {
      method,
      endpoint,
      userId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    // Xử lý lỗi 401 Unauthorized (token hết hạn hoặc không hợp lệ)
    if (error.response && error.response.status === 401) {
      // Clear cache token và thử lại một lần
      accessTokenCache.token = null;
      accessTokenCache.expiresAt = null;
      
      // Nếu là lỗi 401, có thể token đã hết hạn, thử lấy token mới và retry
      try {
        // Clear cache của user nếu có
        if (userId) {
          userTokenCache.delete(userId);
        } else {
          accessTokenCache.token = null;
          accessTokenCache.expiresAt = null;
        }
        
        console.log(`[Sepay eInvoice] Retrying request with new token...`);
        const newToken = await getAccessToken(null, null, userId);
        const retryConfig = {
          method,
          url: `${SEPAY_EINVOICE_BASE_URL}${endpoint}`,
          headers: {
            'Authorization': `Bearer ${newToken}`,
            'Content-Type': 'application/json'
          }
        };
        if (data) retryConfig.data = data;
        if (params) retryConfig.params = params;
        
        const retryResponse = await axios(retryConfig);
        console.log(`[Sepay eInvoice] Retry successful, status: ${retryResponse.status}`);
        return retryResponse.data;
      } catch (retryError) {
        const authError = new Error('Token không hợp lệ hoặc đã hết hạn');
        authError.code = 'EINVOICE_AUTH_FAILED';
        throw authError;
      }
    }
    
    console.error(`Error making authenticated request to ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Danh sách tài khoản nhà cung cấp
 * GET v1/provider-accounts
 * Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/danh-sach-tai-khoan
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function getProviderAccounts(userId = null, page = 1, perPage = 20) {
  try {
    console.log(`[Sepay eInvoice] Getting provider accounts for user: ${userId || 'global'}, page: ${page}, perPage: ${perPage}`);
    
    // Theo tài liệu Sepay: https://developer.sepay.vn/vi/einvoice-api/danh-sach-tai-khoan
    // Query parameters: page, per_page
    const params = {
      page: page,
      per_page: perPage
    };
    
    const response = await makeAuthenticatedRequest('GET', '/v1/provider-accounts', null, params, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Provider accounts response type:', typeof response);
    console.log('[Sepay eInvoice] Provider accounts response:', JSON.stringify(response, null, 2));
    console.log('[Sepay eInvoice] Has response.data:', !!response?.data);
    console.log('[Sepay eInvoice] Has response.data.items:', !!response?.data?.items);
    console.log('[Sepay eInvoice] response.data.items is array:', Array.isArray(response?.data?.items));
    if (response?.data?.items) {
      console.log('[Sepay eInvoice] Items count:', response.data.items.length);
    }
    
    // Theo tài liệu Sepay, response format:
    // {
    //   "data": {
    //     "paging": { "per_page": 20, "total": 1, "has_more": false, "current_page": 1, "page_count": 1 },
    //     "items": [
    //       { "id": "...", "provider": "matbao", "active": true }
    //     ]
    //   }
    // }
    
    // Kiểm tra format response
    if (response && response.success === false) {
      console.error('[Sepay eInvoice] Provider accounts API returned error:', response);
      throw new Error(response.error?.message || response.message || 'Lỗi khi lấy danh sách tài khoản');
    }
    
    // Trả về response đúng format từ Sepay
    // Response từ makeAuthenticatedRequest đã là response.data từ axios
    // Nên nếu Sepay trả về { data: { items: [...] } }, thì response sẽ là { data: { items: [...] } }
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi lấy danh sách tài khoản');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi lấy danh sách tài khoản: ${error.message}`);
  }
}

/**
 * Chi tiết tài khoản nhà cung cấp
 * GET v1/provider-accounts/{id}
 * Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/chi-tiet-tai-khoan
 * @param {string} accountId - ID của provider account
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function getProviderAccountDetails(accountId, userId = null) {
  try {
    if (!accountId) {
      throw new Error('Account ID là bắt buộc');
    }
    
    console.log(`[Sepay eInvoice] Getting provider account details for ID: ${accountId}, user: ${userId || 'global'}`);
    
    const response = await makeAuthenticatedRequest('GET', `/v1/provider-accounts/${accountId}`, null, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Provider account details response:', JSON.stringify(response, null, 2));
    
    // Theo tài liệu Sepay, response format có thể là:
    // { data: { id, provider, active, templates, ... } }
    // hoặc trực tiếp { id, provider, active, templates, ... }
    
    return response;
  } catch (error) {
    // Xử lý lỗi 404 Not Found
    if (error.response && error.response.status === 404) {
      const notFoundError = new Error('Không tìm thấy tài khoản với ID cung cấp');
      notFoundError.code = 'EINVOICE_ACCOUNT_NOT_FOUND';
      throw notFoundError;
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi lấy chi tiết tài khoản');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi lấy chi tiết tài khoản: ${error.message}`);
  }
}

/**
 * Tạo hóa đơn (Create)
 * POST v1/invoices/create
 * Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/xuat-hoa-don-dien-tu
 * @param {any} invoiceData - Dữ liệu hóa đơn
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function createInvoice(invoiceData, userId = null) {
  try {
    if (!invoiceData) {
      throw new Error('Dữ liệu hóa đơn là bắt buộc');
    }

    console.log('[Sepay eInvoice] Creating invoice with data:', JSON.stringify(invoiceData, null, 2));

    // Validation theo format Sepay API mới
    // Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/xuat-hoa-don-dien-tu
    const requiredFields = ['template_code', 'invoice_series', 'issued_date', 'currency', 'provider_account_id', 'buyer', 'items', 'is_draft'];
    
    for (const field of requiredFields) {
      if (invoiceData[field] === undefined || invoiceData[field] === null) {
        throw new Error(`Thiếu trường bắt buộc: ${field}`);
      }
    }

    // Validation buyer
    if (!invoiceData.buyer || !invoiceData.buyer.name) {
      throw new Error('Thiếu thông tin buyer (người mua) - name là bắt buộc');
    }

    // Validation items
    if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      throw new Error('Thiếu danh sách items (sản phẩm/dịch vụ) - cần ít nhất 1 item');
    }

    // Validate items format
    invoiceData.items.forEach((item, index) => {
      if (!item.line_number) {
        throw new Error(`Item ${index + 1}: thiếu line_number`);
      }
      if (!item.line_type) {
        throw new Error(`Item ${index + 1}: thiếu line_type`);
      }
      if (item.line_type === 1 && !item.item_name) {
        throw new Error(`Item ${index + 1}: thiếu item_name`);
      }
      if (item.line_type === 1 && item.quantity === undefined) {
        throw new Error(`Item ${index + 1}: thiếu quantity`);
      }
      if (item.line_type === 1 && item.unit_price === undefined) {
        throw new Error(`Item ${index + 1}: thiếu unit_price`);
      }
    });

    // Chuẩn bị data để gửi đến Sepay (loại bỏ các field không cần thiết)
    const sepayData = {
      template_code: invoiceData.template_code,
      invoice_series: invoiceData.invoice_series,
      issued_date: invoiceData.issued_date,
      currency: invoiceData.currency,
      provider_account_id: invoiceData.provider_account_id,
      buyer: invoiceData.buyer,
      items: invoiceData.items,
      is_draft: invoiceData.is_draft === true || invoiceData.is_draft === 'true'
    };

    // Thêm notes nếu có
    if (invoiceData.notes) {
      sepayData.notes = invoiceData.notes;
    }

    console.log('[Sepay eInvoice] Sending to Sepay API:', JSON.stringify(sepayData, null, 2));

    // Gọi API Sepay
    const response = await makeAuthenticatedRequest('POST', '/v1/invoices/create', sepayData, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Create invoice response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi tạo hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi tạo hóa đơn: ${error.message}`);
  }
}

/**
 * Kiểm tra trạng thái tạo hóa đơn
 * GET v1/invoices/create/check/{tracking_code}
 * @param {string} trackingCode - Tracking code của hóa đơn
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function checkCreateStatus(trackingCode, userId = null) {
  try {
    if (!trackingCode) {
      throw new Error('Tracking code là bắt buộc');
    }
    
    console.log(`[Sepay eInvoice] Checking create status for tracking code: ${trackingCode}, user: ${userId || 'global'}`);
    
    const response = await makeAuthenticatedRequest('GET', `/v1/invoices/create/check/${trackingCode}`, null, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Check create status response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi kiểm tra trạng thái tạo hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi kiểm tra trạng thái tạo hóa đơn: ${error.message}`);
  }
}

/**
 * Phát hành hóa đơn (Issue)
 * POST v1/invoices/issue
 */
/**
 * Phát hành hóa đơn (Issue)
 * POST v1/invoices/issue
 * @param {any} issueData - Dữ liệu phát hành hóa đơn
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function issueInvoice(issueData, userId = null) {
  try {
    if (!issueData) {
      throw new Error('Dữ liệu phát hành hóa đơn là bắt buộc');
    }

    // Validation: cần có reference_code
    if (!issueData.reference_code) {
      throw new Error('Thiếu reference_code để phát hành hóa đơn');
    }

    console.log(`[Sepay eInvoice] Issuing invoice with reference code: ${issueData.reference_code}, user: ${userId || 'global'}`);

    const response = await makeAuthenticatedRequest('POST', '/v1/invoices/issue', issueData, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Issue invoice response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi phát hành hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi phát hành hóa đơn: ${error.message}`);
  }
}

/**
 * Kiểm tra trạng thái phát hành hóa đơn
 * GET v1/invoices/issue/check/{tracking_code}
 */
/**
 * Kiểm tra trạng thái phát hành hóa đơn
 * GET v1/invoices/issue/check/{tracking_code}
 * @param {string} trackingCode - Tracking code của hóa đơn
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function checkIssueStatus(trackingCode, userId = null) {
  try {
    if (!trackingCode) {
      throw new Error('Tracking code là bắt buộc');
    }
    
    console.log(`[Sepay eInvoice] Checking issue status for tracking code: ${trackingCode}, user: ${userId || 'global'}`);
    
    const response = await makeAuthenticatedRequest('GET', `/v1/invoices/issue/check/${trackingCode}`, null, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Check issue status response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi kiểm tra trạng thái phát hành hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi kiểm tra trạng thái phát hành hóa đơn: ${error.message}`);
  }
}

/**
 * Lấy chi tiết hóa đơn
 * GET v1/invoices/{reference_code}
 * @param {string} referenceCode - Reference code của hóa đơn
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function getInvoiceDetails(referenceCode, userId = null) {
  try {
    if (!referenceCode) {
      throw new Error('Reference code là bắt buộc');
    }
    
    console.log(`[Sepay eInvoice] Getting invoice details for reference code: ${referenceCode}, user: ${userId || 'global'}`);
    
    const response = await makeAuthenticatedRequest('GET', `/v1/invoices/${referenceCode}`, null, null, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] Invoice details response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi 404 Not Found
    if (error.response && error.response.status === 404) {
      const notFoundError = new Error('Không tìm thấy hóa đơn với reference code cung cấp');
      notFoundError.code = 'EINVOICE_NOT_FOUND';
      throw notFoundError;
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi lấy chi tiết hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi lấy chi tiết hóa đơn: ${error.message}`);
  }
}

/**
 * Kiểm tra hạn ngạch
 * GET v1/usage
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function getUsage(userId = null) {
  try {
    const response = await makeAuthenticatedRequest('GET', '/v1/usage', null, null, userId);
    
    // Log để debug
    console.log(`[Sepay eInvoice] Usage response for user ${userId || 'global'}:`, JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi kiểm tra hạn ngạch');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi kiểm tra hạn ngạch: ${error.message}`);
  }
}

/**
 * Danh sách hóa đơn (phân trang)
 * GET v1/invoices
 * @param {object} params - Tham số query: page, limit, status, startDate, endDate
 * @param {string} userId - User ID để sử dụng token riêng (optional)
 */
async function listInvoices(params = {}, userId = null) {
  try {
    const queryParams = {};
    // Theo tài liệu Sepay, sử dụng page và per_page
    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.per_page = params.limit; // Sepay dùng per_page thay vì limit
    if (params.status) queryParams.status = params.status;
    if (params.startDate) queryParams.start_date = params.startDate;
    if (params.endDate) queryParams.end_date = params.endDate;

    console.log(`[Sepay eInvoice] Listing invoices with params:`, queryParams, `for user: ${userId || 'global'}`);

    const response = await makeAuthenticatedRequest('GET', '/v1/invoices', null, queryParams, userId);
    
    // Log để debug
    console.log('[Sepay eInvoice] List invoices response:', JSON.stringify(response, null, 2));
    
    return response;
  } catch (error) {
    // Xử lý lỗi từ Sepay API
    if (error.response && error.response.data) {
      const apiError = new Error(error.response.data.error?.message || error.response.data.message || 'Lỗi khi lấy danh sách hóa đơn');
      apiError.code = 'EINVOICE_API_ERROR';
      apiError.details = error.response.data;
      throw apiError;
    }
    throw new Error(`Lỗi khi lấy danh sách hóa đơn: ${error.message}`);
  }
}

/**
 * Đăng nhập và lấy token
 * @param {string} username - Username từ Sepay
 * @param {string} password - Password từ Sepay
 * @param {string} userId - User ID để cache token
 */
async function login(username, password, userId = null) {
  try {
    if (!username || !password) {
      throw new Error('Username và Password là bắt buộc');
    }
    
    const token = await getAccessToken(username, password, userId);
    
    return {
      success: true,
      token: token,
      message: 'Đăng nhập thành công'
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Xóa token cache của user
 * @param {string} userId - User ID
 */
function clearUserToken(userId) {
  if (userId) {
    userTokenCache.delete(userId);
  }
}

module.exports = {
  getAccessToken,
  login,
  clearUserToken,
  getProviderAccounts,
  getProviderAccountDetails,
  createInvoice,
  checkCreateStatus,
  issueInvoice,
  checkIssueStatus,
  getInvoiceDetails,
  getUsage,
  listInvoices
};

