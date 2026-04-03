const sepayEinvoiceService = require('../services/sepayEinvoiceService');
const { Invoice } = require('../models/invoice');
const { EInvoiceQuota, HotelQuota } = require('../models/eInvoiceQuota');
const mongoose = require('mongoose');

/**
 * Đăng nhập Sepay eInvoice
 * POST /e-invoice/login
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const userId = req.user?._id?.toString(); // Lấy user ID từ token authentication

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Username và Password là bắt buộc'
        }
      });
    }

    const result = await sepayEinvoiceService.login(username, password, userId);

    res.status(200).json({
      success: true,
      data: {
        token: result.token,
        message: result.message
      },
      message: 'Đăng nhập thành công'
    });
  } catch (error) {
    console.error('Error logging in to Sepay eInvoice:', error);
    
    // Xử lý lỗi thiếu cấu hình
    if (error.code === 'EINVOICE_CONFIG_MISSING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EINVOICE_CONFIG_MISSING',
          message: error.message,
          details: error.details
        }
      });
    }
    
    // Xử lý lỗi xác thực
    if (error.code === 'EINVOICE_AUTH_FAILED') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'EINVOICE_AUTH_FAILED',
          message: error.message || 'Sai thông tin đăng nhập'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: error.message || 'Lỗi khi đăng nhập vào Sepay eInvoice'
      }
    });
  }
};

/**
 * Đăng xuất (xóa token cache)
 * POST /e-invoice/logout
 */
exports.logout = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    
    if (userId) {
      sepayEinvoiceService.clearUserToken(userId);
    }
    
    res.status(200).json({
      success: true,
      message: 'Đăng xuất thành công'
    });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: error.message || 'Lỗi khi đăng xuất'
      }
    });
  }
};

/**
 * Lấy danh sách tài khoản nhà cung cấp
 * GET /e-invoice/provider-accounts
 */
exports.getProviderAccounts = async (req, res) => {
  // Log ngay từ đầu để đảm bảo controller được gọi
  console.log(`\n[EInvoice Controller] ==========================================`);
  console.log(`[EInvoice Controller] ===== getProviderAccounts CALLED =====`);
  console.log(`[EInvoice Controller] Request URL:`, req.url);
  console.log(`[EInvoice Controller] Request query:`, req.query);
  console.log(`[EInvoice Controller] Request method:`, req.method);
  console.log(`[EInvoice Controller] ==========================================\n`);
  
  try {
    const userId = req.user?._id?.toString(); // Lấy user ID để sử dụng token riêng
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    
    console.log(`[EInvoice Controller] Getting provider accounts for user: ${userId}, page: ${page}, perPage: ${perPage}`);
    
    const result = await sepayEinvoiceService.getProviderAccounts(userId, page, perPage);
    
    console.log(`\n[EInvoice Controller] ===== Processing result =====`);
    console.log(`[EInvoice Controller] Result type:`, typeof result);
    console.log(`[EInvoice Controller] Result is null?:`, result === null);
    console.log(`[EInvoice Controller] Result is undefined?:`, result === undefined);
    console.log(`[EInvoice Controller] Full result:`, JSON.stringify(result, null, 2));
    console.log(`[EInvoice Controller] Has result.data:`, !!result?.data);
    
    if (result?.data) {
      console.log(`[EInvoice Controller] result.data type:`, typeof result.data);
      console.log(`[EInvoice Controller] result.data is array?:`, Array.isArray(result.data));
      console.log(`[EInvoice Controller] result.data keys:`, Object.keys(result.data || {}));
      console.log(`[EInvoice Controller] Has result.data.items:`, !!result.data.items);
      console.log(`[EInvoice Controller] result.data.items is array:`, Array.isArray(result?.data?.items));
      if (result.data.items) {
        console.log(`[EInvoice Controller] Items count:`, result.data.items.length);
        console.log(`[EInvoice Controller] Items:`, JSON.stringify(result.data.items, null, 2));
      }
    }
    console.log(`[EInvoice Controller] ==========================================\n`);
    
    // Theo tài liệu Sepay: https://developer.sepay.vn/vi/einvoice-api/danh-sach-tai-khoan
    // Response format từ Sepay API: { data: { paging: {...}, items: [...] } }
    // makeAuthenticatedRequest trả về response.data từ axios
    // Nếu Sepay API trả về { data: { paging: {...}, items: [...] } }, thì:
    // - axios response.data = { data: { paging: {...}, items: [...] } }
    // - makeAuthenticatedRequest trả về response.data = { data: { paging: {...}, items: [...] } }
    // - result trong controller = { data: { paging: {...}, items: [...] } }
    // - result.data = { paging: {...}, items: [...] }
    // - result.data.items = [...]
    let accounts = [];
    let paging = null;
    
    // Kiểm tra response từ Sepay
    if (!result) {
      console.warn('[EInvoice Controller] Result is null or undefined');
      accounts = [];
    } else if (result && result.success === false) {
      // Sepay trả về lỗi
      console.error('[EInvoice Controller] Sepay returned error:', result);
      return res.status(400).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: result.error?.message || result.message || 'Lỗi từ Sepay eInvoice API',
          details: result.error || result
        }
      });
    } else if (result && result.data) {
      // Format từ Sepay: result = { data: { paging: {...}, items: [...] } }
      // result.data = { paging: {...}, items: [...] }
      console.log(`[EInvoice Controller] Processing result.data...`);
      console.log(`[EInvoice Controller] result.data type:`, typeof result.data);
      console.log(`[EInvoice Controller] result.data is array:`, Array.isArray(result.data));
      console.log(`[EInvoice Controller] result.data keys:`, Object.keys(result.data || {}));
      console.log(`[EInvoice Controller] result.data.items exists:`, !!result.data.items);
      console.log(`[EInvoice Controller] result.data.items is array:`, Array.isArray(result.data.items));
      
      // Kiểm tra result.data.items trước (format chuẩn từ Sepay)
      if (result.data.items && Array.isArray(result.data.items)) {
        accounts = result.data.items;
        paging = result.data.paging || null;
        console.log(`[EInvoice Controller] ✓✓✓ SUCCESS: Found ${accounts.length} accounts in result.data.items`);
        console.log(`[EInvoice Controller] Accounts:`, JSON.stringify(accounts, null, 2));
      } 
      // Kiểm tra result.data có phải là array không
      else if (Array.isArray(result.data)) {
        accounts = result.data;
        console.log(`[EInvoice Controller] ✓✓✓ Found ${accounts.length} accounts in result.data (array)`);
      } 
      // Kiểm tra các trường hợp khác
      else {
        console.warn('[EInvoice Controller] ✗ result.data exists but no items array found');
        console.warn('[EInvoice Controller] result.data structure:', JSON.stringify(result.data, null, 2));
        
        // Thử tìm items ở các vị trí khác
        if (result.data.accounts && Array.isArray(result.data.accounts)) {
          accounts = result.data.accounts;
          console.log(`[EInvoice Controller] ✓✓✓ Found ${accounts.length} accounts in result.data.accounts`);
        } else if (result.items && Array.isArray(result.items)) {
          // Nếu items ở level root
          accounts = result.items;
          paging = result.paging || null;
          console.log(`[EInvoice Controller] ✓✓✓ Found ${accounts.length} accounts in result.items`);
        } else {
          // Nếu không tìm thấy, log để debug
          console.error('[EInvoice Controller] ✗✗✗ Could not find accounts array in result');
          console.error('[EInvoice Controller] result.data keys:', Object.keys(result.data || {}));
          console.error('[EInvoice Controller] Full result.data:', JSON.stringify(result.data, null, 2));
        }
      }
    } else if (Array.isArray(result)) {
      // Fallback: nếu result là array trực tiếp
      accounts = result;
      console.log(`[EInvoice Controller] ✓✓✓ Result is array directly, found ${accounts.length} accounts`);
    } else {
      console.warn('[EInvoice Controller] ✗✗✗ Unexpected result format');
      console.warn('[EInvoice Controller] result keys:', Object.keys(result || {}));
      console.warn('[EInvoice Controller] Full result:', JSON.stringify(result, null, 2));
    }
    
    console.log(`[EInvoice Controller] Final accounts count: ${accounts.length}`);
    if (accounts.length > 0) {
      console.log(`[EInvoice Controller] First account:`, JSON.stringify(accounts[0], null, 2));
    } else {
      console.warn('[EInvoice Controller] ⚠️ No accounts found!');
      console.warn('[EInvoice Controller] Result structure:', JSON.stringify(result, null, 2));
    }
    
    // Trả về format tương thích với frontend
    // Frontend mong đợi: { success: true, data: [...] }
    const responseData = {
      success: true,
      data: accounts,
      paging: paging // Thêm thông tin phân trang nếu có
    };
    
    console.log(`\n[EInvoice Controller] ===== Sending response =====`);
    console.log(`[EInvoice Controller] Accounts count: ${accounts.length}`);
    console.log(`[EInvoice Controller] Response data:`, JSON.stringify(responseData, null, 2));
    console.log(`[EInvoice Controller] ==========================================\n`);
    
    // Đảm bảo không cache response
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Đảm bảo trả về đúng format
    if (accounts.length === 0) {
      console.error(`[EInvoice Controller] ⚠️⚠️⚠️ WARNING: Sending empty array!`);
      console.error(`[EInvoice Controller] Result was:`, JSON.stringify(result, null, 2));
    }
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error('[EInvoice Controller] Error getting provider accounts:', error);
    console.error('[EInvoice Controller] Error stack:', error.stack);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PROVIDER_ACCOUNTS_ERROR',
        message: error.message || 'Lỗi khi lấy danh sách tài khoản nhà cung cấp'
      }
    });
  }
};

/**
 * Lấy chi tiết tài khoản nhà cung cấp
 * GET /e-invoice/provider-accounts/:id
 */
exports.getProviderAccountDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id?.toString(); // Lấy user ID để sử dụng token riêng
    
    console.log(`[EInvoice Controller] Getting provider account details for ID: ${id}, user: ${userId}`);
    
    const result = await sepayEinvoiceService.getProviderAccountDetails(id, userId);
    
    console.log(`[EInvoice Controller] Provider account details result:`, JSON.stringify(result, null, 2));
    
    // Theo tài liệu Sepay, response format có thể là:
    // { data: { id, provider, active, templates, ... } }
    // hoặc trực tiếp { id, provider, active, templates, ... }
    let accountData = null;
    
    if (result && result.data) {
      // Format từ Sepay: { data: { id, provider, active, templates } }
      accountData = result.data;
    } else if (result && result.id) {
      // Format trực tiếp: { id, provider, active, templates }
      accountData = result;
    } else if (result && result.success === false) {
      // Sepay trả về lỗi
      return res.status(400).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: result.error?.message || result.message || 'Lỗi từ Sepay eInvoice API',
          details: result.error || result
        }
      });
    } else {
      accountData = result;
    }
    
    console.log(`[EInvoice Controller] Returning provider account details for ID: ${id}`);
    
    res.status(200).json({
      success: true,
      data: accountData
    });
  } catch (error) {
    console.error('Error getting provider account details:', error);
    
    // Xử lý lỗi 404 Not Found
    if (error.code === 'EINVOICE_ACCOUNT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EINVOICE_ACCOUNT_NOT_FOUND',
          message: error.message || 'Không tìm thấy tài khoản với ID cung cấp'
        }
      });
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PROVIDER_ACCOUNT_DETAILS_ERROR',
        message: error.message || 'Lỗi khi lấy chi tiết tài khoản nhà cung cấp'
      }
    });
  }
};

/**
 * Tạo hóa đơn điện tử
 * POST /e-invoice/create
 */
exports.createInvoice = async (req, res) => {
  try {
    const invoiceData = req.body;
    // Lấy user ID để sử dụng token riêng
    const userId = req.user?._id?.toString();

    console.log('\n[EInvoice Controller] ==========================================');
    console.log('[EInvoice Controller] ===== createInvoice CALLED =====');
    console.log('[EInvoice Controller] Request URL:', req.url);
    console.log('[EInvoice Controller] Request method:', req.method);
    console.log('[EInvoice Controller] User ID:', userId);
    console.log('[EInvoice Controller] Invoice data keys:', Object.keys(invoiceData || {}));
    console.log('[EInvoice Controller] Has invoiceData.invoice?', !!invoiceData?.invoice);
    console.log('[EInvoice Controller] Full invoice data:', JSON.stringify(invoiceData, null, 2));
    console.log('[EInvoice Controller] ==========================================\n');

    // Validation
    if (!invoiceData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INVOICE_DATA',
          message: 'Dữ liệu hóa đơn là bắt buộc'
        }
      });
    }

    // Validation format theo Sepay API mới
    // Theo tài liệu: https://developer.sepay.vn/vi/einvoice-api/xuat-hoa-don-dien-tu
    const requiredFields = ['template_code', 'invoice_series', 'issued_date', 'currency', 'provider_account_id', 'buyer', 'items', 'is_draft'];
    
    for (const field of requiredFields) {
      if (invoiceData[field] === undefined || invoiceData[field] === null) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELD',
            message: `Thiếu trường bắt buộc: ${field}`
          }
        });
      }
    }

    // Validation buyer
    if (!invoiceData.buyer || !invoiceData.buyer.name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_BUYER_INFO',
          message: 'Thiếu thông tin buyer (người mua) - name là bắt buộc'
        }
      });
    }

    // Validation items
    if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ITEMS',
          message: 'Thiếu danh sách items (sản phẩm/dịch vụ) - cần ít nhất 1 item'
        }
      });
    }

    // Validate items format
    for (let i = 0; i < invoiceData.items.length; i++) {
      const item = invoiceData.items[i];
      if (!item.line_number) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ITEM_FORMAT',
            message: `Item ${i + 1}: thiếu line_number`
          }
        });
      }
      if (!item.line_type) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ITEM_FORMAT',
            message: `Item ${i + 1}: thiếu line_type`
          }
        });
      }
      if (item.line_type === 1 && !item.item_name) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ITEM_FORMAT',
            message: `Item ${i + 1}: thiếu item_name`
          }
        });
      }
    }
    
    // Gọi Sepay API để tạo hóa đơn
    // Service sẽ xử lý validation và format đúng theo Sepay API
    const result = await sepayEinvoiceService.createInvoice(invoiceData, userId);

    // Lưu thông tin vào database nếu có invoiceId trong hệ thống
    const hotelId = req.user?.hotelId?.toString();
    if (invoiceData.invoiceId) {
      try {
        const invoice = await Invoice.findById(invoiceData.invoiceId);
        if (invoice) {
          invoice.einvoiceTrackingCode = result.data?.tracking_code || result.tracking_code;
          invoice.einvoiceReferenceCode = result.data?.reference_code || result.reference_code;
          invoice.einvoiceStatus = invoiceData.is_draft ? 'created' : 'creating';
          invoice.einvoiceData = result.data || result;
          // Lưu userId để sử dụng khi check status sau này
          if (userId) {
            invoice.einvoiceUserId = userId;
          }
          // Đảm bảo hotelId được lưu (nếu chưa có)
          if (hotelId && !invoice.hotelId) {
            invoice.hotelId = hotelId;
          }
          await invoice.save();
        }
      } catch (dbError) {
        console.error('Error saving einvoice tracking code to invoice:', dbError);
        // Không throw error, chỉ log vì Sepay đã tạo thành công
      }
    }
    
    // Cập nhật quota khi tạo hóa đơn (nếu không phải draft và có hotelId)
    if (!invoiceData.is_draft && hotelId) {
      try {
        const hotelQuota = await HotelQuota.findOne({ hotelId });
        if (hotelQuota && hotelQuota.remainingQuota > 0) {
          hotelQuota.usedQuota = (hotelQuota.usedQuota || 0) + 1;
          await hotelQuota.save();
          
          // Cập nhật system quota
          const systemQuota = await EInvoiceQuota.findOne();
          if (systemQuota) {
            systemQuota.usedQuota = (systemQuota.usedQuota || 0) + 1;
            await systemQuota.save();
          }
        }
      } catch (quotaError) {
        console.error('Error updating quota:', quotaError);
        // Không throw error, chỉ log
      }
    }

    // Xử lý response từ Sepay API
    // Format: { success: true, data: { tracking_code, ... } }
    const responseData = result.data || result;
    
    res.status(200).json({
      success: true,
      data: responseData,
      message: 'Tạo hóa đơn điện tử thành công',
      tracking_code: responseData.tracking_code
    });
  } catch (error) {
    console.error('Error creating e-invoice:', error);
    
    // Xử lý lỗi thiếu cấu hình đặc biệt
    if (error.code === 'EINVOICE_CONFIG_MISSING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EINVOICE_CONFIG_MISSING',
          message: 'Chưa cấu hình Sepay eInvoice API',
          details: error.details || {
            message: 'Vui lòng cấu hình các biến môi trường sau trong file .env:',
            required: [
              'SEPAY_EINVOICE_BASE_URL=https://einvoice-api-sandbox.sepay.vn',
              'SEPAY_EINVOICE_USERNAME=your_username',
              'SEPAY_EINVOICE_PASSWORD=your_password'
            ],
            documentation: 'Xem hướng dẫn tại: nest/backend/SEPAY_EINVOICE_SETUP.md'
          }
        }
      });
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    // Xử lý lỗi validation
    if (error.code === 'INVALID_INVOICE_FORMAT' || error.code === 'INVALID_SELLER_INFO' || 
        error.code === 'INVALID_BUYER_INFO' || error.code === 'INVALID_ITEMS') {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_EINVOICE_ERROR',
        message: error.message || 'Lỗi khi tạo hóa đơn điện tử',
        details: error.response?.data || error.details
      }
    });
  }
};

/**
 * Kiểm tra trạng thái tạo hóa đơn
 * GET /e-invoice/create/check/:trackingCode
 */
exports.checkCreateStatus = async (req, res) => {
  try {
    const { trackingCode } = req.params;
    
    console.log(`[EInvoice Controller] Checking create status for tracking code: ${trackingCode}`);
    
    if (!trackingCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TRACKING_CODE',
          message: 'Tracking code là bắt buộc'
        }
      });
    }

    // Lấy userId từ invoice trong database (ưu tiên) hoặc từ req.user
    let userId = null;
    try {
      const invoice = await Invoice.findOne({ einvoiceTrackingCode: trackingCode });
      if (invoice && invoice.einvoiceUserId) {
        userId = invoice.einvoiceUserId.toString();
        console.log(`[EInvoice Controller] Found userId from invoice: ${userId}`);
      } else {
        // Fallback: lấy từ req.user
        userId = req.user?._id?.toString();
        console.log(`[EInvoice Controller] Using userId from request: ${userId || 'global'}`);
      }
    } catch (dbError) {
      console.error('[EInvoice Controller] Error finding invoice:', dbError);
      // Fallback: lấy từ req.user
      userId = req.user?._id?.toString();
    }

    const result = await sepayEinvoiceService.checkCreateStatus(trackingCode, userId);

    // Xử lý response theo format Sepay: { success: true, data: { status, message, reference_code } }
    const statusData = result.data || result;

    // Cập nhật trạng thái trong database nếu có
    if (statusData.status) {
      try {
        const invoice = await Invoice.findOne({ einvoiceTrackingCode: trackingCode });
        if (invoice) {
          invoice.einvoiceStatus = statusData.status === 'success' ? 'created' : 'failed';
          invoice.einvoiceData = statusData;
          if (statusData.reference_code) {
            invoice.einvoiceReferenceCode = statusData.reference_code;
          }
          // Lưu userId nếu chưa có
          if (userId && !invoice.einvoiceUserId) {
            invoice.einvoiceUserId = userId;
          }
          await invoice.save();
        }
      } catch (dbError) {
        console.error('Error updating invoice status:', dbError);
      }
    }

    res.status(200).json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error('Error checking create status:', error);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'CHECK_CREATE_STATUS_ERROR',
        message: error.message || 'Lỗi khi kiểm tra trạng thái tạo hóa đơn'
      }
    });
  }
};

/**
 * Phát hành hóa đơn điện tử
 * POST /e-invoice/issue
 */
exports.issueInvoice = async (req, res) => {
  try {
    const issueData = req.body;
    // Lấy user ID để sử dụng token riêng (giống như khi tạo invoice)
    const userId = req.user?._id?.toString();

    console.log(`[EInvoice Controller] Issuing invoice with reference code: ${issueData?.reference_code}, user: ${userId || 'global'}`);

    if (!issueData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ISSUE_DATA',
          message: 'Dữ liệu phát hành hóa đơn là bắt buộc'
        }
      });
    }

    // Validation: cần có reference_code
    if (!issueData.reference_code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFERENCE_CODE',
          message: 'Thiếu reference_code để phát hành hóa đơn'
        }
      });
    }

    const result = await sepayEinvoiceService.issueInvoice(issueData, userId);

    // Xử lý response theo format Sepay: { success: true, data: { tracking_code } }
    const issueResponseData = result.data || result;

    // Cập nhật trạng thái trong database
    if (issueData.reference_code) {
      try {
        const invoice = await Invoice.findOne({ einvoiceReferenceCode: issueData.reference_code });
        if (invoice) {
          invoice.einvoiceIssueTrackingCode = issueResponseData.tracking_code;
          invoice.einvoiceStatus = 'issuing';
          // Lưu userId nếu chưa có
          if (userId && !invoice.einvoiceUserId) {
            invoice.einvoiceUserId = userId;
          }
          await invoice.save();
        }
      } catch (dbError) {
        console.error('Error saving issue tracking code:', dbError);
      }
    }

    res.status(200).json({
      success: true,
      data: issueResponseData,
      message: 'Yêu cầu phát hành hóa đơn điện tử đã được gửi',
      tracking_code: issueResponseData.tracking_code
    });
  } catch (error) {
    console.error('Error issuing e-invoice:', error);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'ISSUE_EINVOICE_ERROR',
        message: error.message || 'Lỗi khi phát hành hóa đơn điện tử'
      }
    });
  }
};

/**
 * Kiểm tra trạng thái phát hành hóa đơn
 * GET /e-invoice/issue/check/:trackingCode
 */
exports.checkIssueStatus = async (req, res) => {
  try {
    const { trackingCode } = req.params;
    
    console.log(`[EInvoice Controller] Checking issue status for tracking code: ${trackingCode}`);
    
    if (!trackingCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TRACKING_CODE',
          message: 'Tracking code là bắt buộc'
        }
      });
    }

    // Lấy userId từ invoice trong database (ưu tiên) hoặc từ req.user
    let userId = null;
    try {
      const invoice = await Invoice.findOne({ einvoiceIssueTrackingCode: trackingCode });
      if (invoice && invoice.einvoiceUserId) {
        userId = invoice.einvoiceUserId.toString();
        console.log(`[EInvoice Controller] Found userId from invoice: ${userId}`);
      } else {
        // Fallback: lấy từ req.user
        userId = req.user?._id?.toString();
        console.log(`[EInvoice Controller] Using userId from request: ${userId || 'global'}`);
      }
    } catch (dbError) {
      console.error('[EInvoice Controller] Error finding invoice:', dbError);
      // Fallback: lấy từ req.user
      userId = req.user?._id?.toString();
    }

    const result = await sepayEinvoiceService.checkIssueStatus(trackingCode, userId);

    // Xử lý response theo format Sepay: { success: true, data: { status, message, invoice_url, pdf_url } }
    const statusData = result.data || result;

    // Cập nhật trạng thái trong database
    const hotelId = req.user?.hotelId?.toString();
    if (statusData.status) {
      try {
        const invoice = await Invoice.findOne({ einvoiceIssueTrackingCode: trackingCode });
        if (invoice) {
          invoice.einvoiceStatus = statusData.status === 'success' ? 'issued' : 'issue_failed';
          invoice.einvoiceData = statusData;
          if (statusData.invoice_url) {
            invoice.einvoiceUrl = statusData.invoice_url;
          }
          if (statusData.pdf_url) {
            invoice.einvoicePdfUrl = statusData.pdf_url;
          }
          // Lưu userId nếu chưa có
          if (userId && !invoice.einvoiceUserId) {
            invoice.einvoiceUserId = userId;
          }
          // Đảm bảo hotelId được lưu (nếu chưa có)
          if (hotelId && !invoice.hotelId) {
            invoice.hotelId = hotelId;
          }
          await invoice.save();
          
          // Cập nhật quota khi hóa đơn được phát hành thành công
          if (statusData.status === 'success' && invoice.hotelId) {
            try {
              const hotelQuota = await HotelQuota.findOne({ hotelId: invoice.hotelId });
              if (hotelQuota && hotelQuota.remainingQuota > 0) {
                hotelQuota.usedQuota = (hotelQuota.usedQuota || 0) + 1;
                await hotelQuota.save();
                
                // Cập nhật system quota
                const systemQuota = await EInvoiceQuota.findOne();
                if (systemQuota) {
                  systemQuota.usedQuota = (systemQuota.usedQuota || 0) + 1;
                  await systemQuota.save();
                }
              }
            } catch (quotaError) {
              console.error('Error updating quota on issue:', quotaError);
              // Không throw error, chỉ log
            }
          }
        }
      } catch (dbError) {
        console.error('Error updating invoice issue status:', dbError);
      }
    }

    res.status(200).json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error('Error checking issue status:', error);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'CHECK_ISSUE_STATUS_ERROR',
        message: error.message || 'Lỗi khi kiểm tra trạng thái phát hành hóa đơn'
      }
    });
  }
};

/**
 * Proxy để lấy PDF hóa đơn (tránh download)
 * GET /e-invoice/pdf-proxy?url=...
 */
exports.getPdfProxy = async (req, res) => {
  try {
    const { url } = req.query;
    
    console.log('[EInvoice Controller] PDF Proxy - URL:', url);
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_URL',
          message: 'URL là bắt buộc'
        }
      });
    }

    const axios = require('axios');
    const sepayEinvoiceService = require('../services/sepayEinvoiceService');
    
    // Lấy userId từ request để dùng token đúng user
    const userId = req.user?._id?.toString();
    
    // Fetch PDF từ URL - không cần token vì đây là public URL từ Sepay
    console.log('[EInvoice Controller] Fetching PDF from:', url);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'Accept': 'application/pdf, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://einvoice-api-sandbox.sepay.vn/'
      },
      maxRedirects: 5,
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Chấp nhận redirect
      }
    });

    console.log('[EInvoice Controller] PDF fetched, size:', response.data.length, 'bytes');

    // Set headers để trình duyệt hiển thị PDF thay vì tải xuống
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    res.setHeader('Content-Length', response.data.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Trả về PDF data
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('[EInvoice Controller] Error proxying PDF:', error);
    console.error('[EInvoice Controller] Error details:', error.response?.status, error.response?.statusText);
    
    res.status(500).json({
      success: false,
      error: {
        code: 'PDF_PROXY_ERROR',
        message: error.message || 'Lỗi khi lấy PDF',
        details: error.response?.data
      }
    });
  }
};

/**
 * Lấy chi tiết hóa đơn điện tử
 * GET /e-invoice/:referenceCode
 */
exports.getInvoiceDetails = async (req, res) => {
  try {
    const { referenceCode } = req.params;
    
    if (!referenceCode) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFERENCE_CODE',
          message: 'Reference code là bắt buộc'
        }
      });
    }

    // Lấy userId từ invoice trong database (ưu tiên) hoặc từ req.user
    // Ưu tiên: einvoiceUserId từ invoice > req.user > null (global token)
    let userId = null;
    try {
      // Tìm invoice bằng referenceCode trong các field: einvoiceReferenceCode, einvoiceTrackingCode, einvoiceIssueTrackingCode
      const invoice = await Invoice.findOne({
        $or: [
          { einvoiceReferenceCode: referenceCode },
          { einvoiceTrackingCode: referenceCode },
          { einvoiceIssueTrackingCode: referenceCode }
        ]
      });
      
      console.log(`[EInvoice Controller] Searching for invoice with referenceCode: ${referenceCode}`);
      console.log(`[EInvoice Controller] Invoice found: ${!!invoice}`);
      
      if (invoice && invoice.einvoiceUserId) {
        userId = invoice.einvoiceUserId.toString();
        console.log(`[EInvoice Controller] Found userId from invoice: ${userId}`);
      } else {
        // Fallback: lấy từ req.user (ưu tiên hơn global token)
        userId = req.user?._id?.toString();
        console.log(`[EInvoice Controller] Invoice not found or no einvoiceUserId, using userId from request: ${userId || 'null (will use global token)'}`);
      }
    } catch (dbError) {
      console.error('[EInvoice Controller] Error finding invoice:', dbError);
      // Fallback: lấy từ req.user
      userId = req.user?._id?.toString();
      console.log(`[EInvoice Controller] Error occurred, using userId from request: ${userId || 'null (will use global token)'}`);
    }
    
    // Nếu vẫn không có userId, sẽ dùng null (global token hoặc .env)
    // Điều này cho phép dùng global token hoặc .env credentials nếu user chưa đăng nhập
    if (!userId) {
      console.log(`[EInvoice Controller] No userId available, will use global token or .env credentials`);
    }

    const result = await sepayEinvoiceService.getInvoiceDetails(referenceCode, userId);

    // Format response theo Sepay API: { success: true, data: { ...invoice detail + file URLs } }
    const invoiceDetails = result.data || result;

    res.status(200).json({
      success: true,
      data: invoiceDetails
    });
  } catch (error) {
    console.error('Error getting invoice details:', error);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    
    // Xử lý lỗi 404 Not Found
    if (error.code === 'EINVOICE_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EINVOICE_NOT_FOUND',
          message: error.message || 'Không tìm thấy hóa đơn với reference code cung cấp'
        }
      });
    }
    
    // Xử lý lỗi thiếu credentials
    if (error.code === 'EINVOICE_CONFIG_MISSING' || error.code === 'EINVOICE_TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code || 'EINVOICE_AUTH_ERROR',
          message: error.details?.message || error.message || 'Không thể xác thực với Sepay eInvoice API. Vui lòng đăng nhập lại hoặc kiểm tra cấu hình.',
          details: error.details
        }
      });
    }
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_INVOICE_DETAILS_ERROR',
        message: error.message || 'Lỗi khi lấy chi tiết hóa đơn điện tử',
        details: error.details || error.stack
      }
    });
  }
};

/**
 * Kiểm tra hạn ngạch
 * GET /e-invoice/usage
 * - Nếu là admin/superadmin: trả về tổng quota từ Sepay
 * - Nếu là hotel: trả về quota của hotel đó
 */
exports.getUsage = async (req, res) => {
  try {
    // Lấy userId từ request để sử dụng token riêng của user
    const userId = req.user?._id?.toString() || null;
    const userRole = req.user?.role;
    const hotelId = req.user?.hotelId?.toString();
    
    // Gọi Sepay API để lấy tổng quota
    const result = await sepayEinvoiceService.getUsage(userId);
    const usageData = result.data || result;
    const quotaRemaining = parseInt(usageData.quota_remaning || usageData.quota_remaining || 0);
    
    // Lưu tổng quota vào database (system level)
    let systemQuota = await EInvoiceQuota.findOne();
    if (!systemQuota) {
      systemQuota = new EInvoiceQuota({
        totalQuota: quotaRemaining,
        remainingQuota: quotaRemaining,
        unallocatedQuota: quotaRemaining
      });
    } else {
      // Cập nhật tổng quota từ Sepay
      const oldTotal = systemQuota.totalQuota;
      systemQuota.totalQuota = quotaRemaining + systemQuota.usedQuota;
      systemQuota.remainingQuota = quotaRemaining;
      systemQuota.unallocatedQuota = systemQuota.totalQuota - systemQuota.allocatedQuota;
      systemQuota.lastUpdatedFromSepay = new Date();
    }
    await systemQuota.save();
    
    // Nếu là admin/superadmin, trả về tổng quota
    if (userRole === 'superadmin' || userRole === 'admin') {
      return res.status(200).json({
        success: true,
        data: {
          quota_remaning: quotaRemaining,
          totalQuota: systemQuota.totalQuota,
          usedQuota: systemQuota.usedQuota,
          allocatedQuota: systemQuota.allocatedQuota,
          unallocatedQuota: systemQuota.unallocatedQuota,
          isSystemLevel: true
        }
      });
    }
    
    // Nếu là hotel, trả về quota của hotel đó
    if (hotelId) {
      const hotelQuota = await HotelQuota.findOne({ hotelId });
      if (hotelQuota) {
        return res.status(200).json({
          success: true,
          data: {
            quota_remaning: hotelQuota.remainingQuota,
            allocatedQuota: hotelQuota.allocatedQuota,
            usedQuota: hotelQuota.usedQuota,
            isHotelLevel: true
          }
        });
      }
    }
    
    // Nếu không có hotel quota, trả về tổng quota (fallback)
    res.status(200).json({
      success: true,
      data: {
        quota_remaning: quotaRemaining,
        isSystemLevel: true
      }
    });
  } catch (error) {
    console.error('Error getting usage:', error);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_USAGE_ERROR',
        message: error.message || 'Lỗi khi kiểm tra hạn ngạch'
      }
    });
  }
};

/**
 * Phân chia quota cho hotel
 * POST /e-invoice/quota/allocate
 */
exports.allocateQuota = async (req, res) => {
  try {
    const { hotelId, packages } = req.body;
    
    if (!hotelId || !packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Thiếu thông tin hotelId hoặc packages'
        }
      });
    }
    
    // Validate hotelId
    if (!mongoose.Types.ObjectId.isValid(hotelId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_HOTEL_ID',
          message: 'hotelId không hợp lệ'
        }
      });
    }
    
    // Tính tổng số invoice từ các packages
    let totalInvoices = 0;
    for (const pkg of packages) {
      const invoiceCount = parseInt(pkg.invoiceCount || 0);
      if (invoiceCount > 0) {
        totalInvoices += invoiceCount;
      }
    }
    
    if (totalInvoices <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PACKAGES',
          message: 'Tổng số hóa đơn từ các gói phải lớn hơn 0'
        }
      });
    }
    
    // Lấy system quota
    let systemQuota = await EInvoiceQuota.findOne();
    if (!systemQuota) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SYSTEM_QUOTA_NOT_FOUND',
          message: 'Chưa có thông tin quota hệ thống. Vui lòng kiểm tra quota từ Sepay trước.'
        }
      });
    }
    
    // Kiểm tra unallocated quota
    if (systemQuota.unallocatedQuota < totalInvoices) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_QUOTA',
          message: `Không đủ quota để phân chia. Quota còn lại: ${systemQuota.unallocatedQuota}, yêu cầu: ${totalInvoices}`
        }
      });
    }
    
    // Tìm hoặc tạo hotel quota
    let hotelQuota = await HotelQuota.findOne({ hotelId });
    if (!hotelQuota) {
      hotelQuota = new HotelQuota({
        hotelId,
        allocatedQuota: 0,
        usedQuota: 0,
        remainingQuota: 0,
        packages: [],
        paymentStatus: 'pending'
      });
    }
    
    // Cập nhật hotel quota
    hotelQuota.allocatedQuota = (hotelQuota.allocatedQuota || 0) + totalInvoices;
    hotelQuota.remainingQuota = hotelQuota.allocatedQuota - (hotelQuota.usedQuota || 0);
    
    // Thêm packages vào danh sách
    if (!hotelQuota.packages) {
      hotelQuota.packages = [];
    }
    hotelQuota.packages.push(...packages);
    
    await hotelQuota.save();
    
    // Cập nhật system quota
    systemQuota.allocatedQuota = (systemQuota.allocatedQuota || 0) + totalInvoices;
    systemQuota.unallocatedQuota = systemQuota.totalQuota - systemQuota.allocatedQuota;
    await systemQuota.save();
    
    res.status(200).json({
      success: true,
      data: {
        hotelId,
        allocatedQuota: totalInvoices,
        hotelTotalAllocated: hotelQuota.allocatedQuota,
        hotelRemaining: hotelQuota.remainingQuota,
        systemUnallocated: systemQuota.unallocatedQuota
      },
      message: `Đã phân chia ${totalInvoices} hóa đơn cho hotel ${hotelId}`
    });
  } catch (error) {
    console.error('Error allocating quota:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALLOCATE_QUOTA_ERROR',
        message: error.message || 'Lỗi khi phân chia quota'
      }
    });
  }
};

/**
 * Lấy danh sách quota của các hotel
 * GET /e-invoice/quota/hotels
 */
exports.getHotelQuotas = async (req, res) => {
  try {
    const hotelQuotas = await HotelQuota.find().populate('hotelId', 'name email');
    
    const quotas = hotelQuotas.map(quota => ({
      hotelId: quota.hotelId,
      hotelName: quota.hotelId?.name || 'N/A',
      allocatedQuota: quota.allocatedQuota || 0,
      usedQuota: quota.usedQuota || 0,
      remainingQuota: quota.remainingQuota || 0,
      packages: quota.packages || [],
      paymentStatus: quota.paymentStatus || 'pending',
      createdAt: quota.createdAt,
      updatedAt: quota.updatedAt
    }));
    
    res.status(200).json({
      success: true,
      data: quotas,
      total: quotas.length
    });
  } catch (error) {
    console.error('Error getting hotel quotas:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_HOTEL_QUOTAS_ERROR',
        message: error.message || 'Lỗi khi lấy danh sách quota của các hotel'
      }
    });
  }
};

/**
 * Danh sách hóa đơn điện tử
 * GET /e-invoice
 */
exports.listInvoices = async (req, res) => {
  try {
    const { page, limit, per_page, status, startDate, endDate } = req.query;
    const userId = req.user?._id?.toString();
    
    const params = {};
    if (page) params.page = parseInt(page);
    // Sepay sử dụng per_page, nhưng hỗ trợ cả limit để tương thích
    if (per_page) params.limit = parseInt(per_page);
    else if (limit) params.limit = parseInt(limit);
    if (status) params.status = status;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const result = await sepayEinvoiceService.listInvoices(params, userId);

    // Format response theo Sepay API: { success: true, data: { invoices: [...], paging: {...} } }
    const listData = result.data || result;

    res.status(200).json({
      success: true,
      data: listData
    });
  } catch (error) {
    console.error('Error listing invoices:', error);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_INVOICES_ERROR',
        message: error.message || 'Lỗi khi lấy danh sách hóa đơn điện tử'
      }
    });
  }
};

/**
 * Lấy danh sách hóa đơn nháp (drafts) từ Sepay API
 * GET /e-invoice/drafts
 */
exports.getDrafts = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    const userRole = req.user?.role;
    const hotelId = req.user?.hotelId?.toString();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    console.log(`[EInvoice Controller] Getting drafts from Sepay for user: ${userId || 'global'}, hotelId: ${hotelId || 'none'}, role: ${userRole}, page: ${page}, limit: ${limit}`);
    
    // Gọi Sepay API để lấy danh sách hóa đơn nháp
    const params = {
      page: page,
      limit: limit,
      status: 'draft' // Lấy chỉ hóa đơn nháp
    };
    
    const result = await sepayEinvoiceService.listInvoices(params, userId);
    
    // Format response theo Sepay API: { success: true, data: { invoices: [...], paging: {...} } }
    const listData = result.data || result;
    const invoices = listData.invoices || listData.items || [];
    const paging = listData.paging || {};
    
    // Lọc hóa đơn theo hotelId nếu không phải admin/superadmin
    let filteredInvoices = invoices;
    if (hotelId && userRole !== 'superadmin' && userRole !== 'admin') {
      // Tìm các invoice trong database có hotelId tương ứng
      const invoiceReferenceCodes = invoices.map(inv => 
        inv.reference_code || inv.tracking_code || inv.invoice_number || inv.id
      ).filter(Boolean);
      
      const dbInvoices = await Invoice.find({
        $or: [
          { einvoiceReferenceCode: { $in: invoiceReferenceCodes } },
          { einvoiceTrackingCode: { $in: invoiceReferenceCodes } },
          { einvoiceIssueTrackingCode: { $in: invoiceReferenceCodes } }
        ],
        hotelId: hotelId
      }).select('einvoiceReferenceCode einvoiceTrackingCode einvoiceIssueTrackingCode');
      
      const allowedReferenceCodes = new Set();
      dbInvoices.forEach(inv => {
        if (inv.einvoiceReferenceCode) allowedReferenceCodes.add(inv.einvoiceReferenceCode);
        if (inv.einvoiceTrackingCode) allowedReferenceCodes.add(inv.einvoiceTrackingCode);
        if (inv.einvoiceIssueTrackingCode) allowedReferenceCodes.add(inv.einvoiceIssueTrackingCode);
      });
      
      filteredInvoices = invoices.filter(inv => {
        const refCode = inv.reference_code || inv.tracking_code || inv.invoice_number || inv.id;
        return allowedReferenceCodes.has(refCode);
      });
    }
    
    // Map dữ liệu từ Sepay sang format frontend mong đợi
    // Filter chỉ lấy hóa đơn có status = 'draft'
    const drafts = filteredInvoices
      .filter((invoice) => invoice.status === 'draft' || invoice.status === 'Draft')
      .map((invoice) => ({
        id: invoice.id || invoice.invoice_number || invoice.reference_code || invoice.tracking_code,
        invoiceNumber: invoice.invoice_number || invoice.invoiceNumber || invoice.id,
        invoiceDate: invoice.issued_date ? new Date(invoice.issued_date) : (invoice.created_at ? new Date(invoice.created_at) : new Date()),
        customerName: invoice.buyer?.name || invoice.customer_name || 'Khách lẻ',
        totalAmount: invoice.total_amount || invoice.totalAmount || invoice.amount || 0,
        status: 'draft', // Đảm bảo status là 'draft'
        createdAt: invoice.created_at ? new Date(invoice.created_at) : (invoice.issued_date ? new Date(invoice.issued_date) : new Date()),
        // Thêm các thông tin khác từ Sepay - ưu tiên các field có thể dùng làm reference code
        referenceCode: invoice.reference_code || invoice.tracking_code || invoice.invoice_number || invoice.id,
        trackingCode: invoice.tracking_code || invoice.reference_code,
        invoiceUrl: invoice.invoice_url,
        pdfUrl: invoice.pdf_url,
        // Dữ liệu gốc từ Sepay
        sepayData: invoice
      }));
    
    const total = paging.total || filteredInvoices.length;
    const totalPages = paging.page_count || Math.ceil(total / limit);
    
    console.log(`[EInvoice Controller] Found ${drafts.length} drafts from Sepay (filtered: ${filteredInvoices.length} from ${invoices.length} total), total: ${total}`);
    
    res.status(200).json({
      success: true,
      data: {
        drafts: drafts,
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages
      }
    });
  } catch (error) {
    console.error('[EInvoice Controller] Error getting drafts from Sepay:', error);
    console.error('[EInvoice Controller] Error stack:', error.stack);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DRAFTS_ERROR',
        message: error.message || 'Lỗi khi lấy danh sách hóa đơn nháp'
      }
    });
  }
};

/**
 * Lấy danh sách hóa đơn đã phát hành (issued)
 * GET /e-invoice/issued
 */
exports.getIssuedInvoices = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    const userRole = req.user?.role;
    const hotelId = req.user?.hotelId?.toString();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    console.log(`[EInvoice Controller] Getting issued invoices from Sepay for user: ${userId || 'global'}, hotelId: ${hotelId || 'none'}, role: ${userRole}, page: ${page}, limit: ${limit}`);
    
    // Gọi Sepay API để lấy danh sách hóa đơn đã phát hành
    const params = {
      page: page,
      limit: limit,
      status: 'issued' // Lấy chỉ hóa đơn đã phát hành
    };
    
    const result = await sepayEinvoiceService.listInvoices(params, userId);
    
    // Format response theo Sepay API: { success: true, data: { invoices: [...], paging: {...} } }
    const listData = result.data || result;
    const invoices = listData.invoices || listData.items || [];
    const paging = listData.paging || {};
    
    // Lọc hóa đơn theo hotelId nếu không phải admin/superadmin
    let filteredInvoices = invoices;
    if (hotelId && userRole !== 'superadmin' && userRole !== 'admin') {
      // Tìm các invoice trong database có hotelId tương ứng
      const invoiceReferenceCodes = invoices.map(inv => 
        inv.reference_code || inv.tracking_code || inv.invoice_number || inv.id
      ).filter(Boolean);
      
      const dbInvoices = await Invoice.find({
        $or: [
          { einvoiceReferenceCode: { $in: invoiceReferenceCodes } },
          { einvoiceTrackingCode: { $in: invoiceReferenceCodes } },
          { einvoiceIssueTrackingCode: { $in: invoiceReferenceCodes } }
        ],
        hotelId: hotelId
      }).select('einvoiceReferenceCode einvoiceTrackingCode einvoiceIssueTrackingCode');
      
      const allowedReferenceCodes = new Set();
      dbInvoices.forEach(inv => {
        if (inv.einvoiceReferenceCode) allowedReferenceCodes.add(inv.einvoiceReferenceCode);
        if (inv.einvoiceTrackingCode) allowedReferenceCodes.add(inv.einvoiceTrackingCode);
        if (inv.einvoiceIssueTrackingCode) allowedReferenceCodes.add(inv.einvoiceIssueTrackingCode);
      });
      
      filteredInvoices = invoices.filter(inv => {
        const refCode = inv.reference_code || inv.tracking_code || inv.invoice_number || inv.id;
        return allowedReferenceCodes.has(refCode);
      });
    }
    
    // Map dữ liệu từ Sepay sang format frontend mong đợi
    // Filter chỉ lấy hóa đơn có status = 'issued'
    const issuedInvoices = filteredInvoices
      .filter((invoice) => invoice.status === 'issued' || invoice.status === 'Issued')
      .map((invoice) => ({
        id: invoice.id || invoice.invoice_number || invoice.reference_code || invoice.tracking_code,
        invoiceNumber: invoice.invoice_number || invoice.invoiceNumber || invoice.id,
        invoiceDate: invoice.issued_date ? new Date(invoice.issued_date) : (invoice.created_at ? new Date(invoice.created_at) : new Date()),
        customerName: invoice.buyer?.name || invoice.customer_name || 'Khách lẻ',
        totalAmount: invoice.total_amount || invoice.totalAmount || invoice.amount || 0,
        status: 'issued', // Đảm bảo status là 'issued'
        createdAt: invoice.created_at ? new Date(invoice.created_at) : (invoice.issued_date ? new Date(invoice.issued_date) : new Date()),
        // Thêm các thông tin khác từ Sepay - ưu tiên các field có thể dùng làm reference code
        referenceCode: invoice.reference_code || invoice.tracking_code || invoice.invoice_number || invoice.id,
        trackingCode: invoice.tracking_code || invoice.reference_code,
        invoiceUrl: invoice.invoice_url,
        pdfUrl: invoice.pdf_url,
        // Dữ liệu gốc từ Sepay
        sepayData: invoice
      }));
    
    const total = paging.total || filteredInvoices.length;
    const totalPages = paging.page_count || Math.ceil(total / limit);
    
    console.log(`[EInvoice Controller] Found ${issuedInvoices.length} issued invoices from Sepay (filtered: ${filteredInvoices.length} from ${invoices.length} total), total: ${total}`);
    
    res.status(200).json({
      success: true,
      data: {
        invoices: issuedInvoices,
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages
      }
    });
  } catch (error) {
    console.error('[EInvoice Controller] Error getting issued invoices from Sepay:', error);
    console.error('[EInvoice Controller] Error stack:', error.stack);
    
    // Xử lý lỗi từ Sepay API
    if (error.code === 'EINVOICE_API_ERROR') {
      return res.status(error.response?.status || 500).json({
        success: false,
        error: {
          code: 'EINVOICE_API_ERROR',
          message: error.message || 'Lỗi từ Sepay eInvoice API',
          details: error.details || error.response?.data
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ISSUED_INVOICES_ERROR',
        message: error.message || 'Lỗi khi lấy danh sách hóa đơn đã xuất'
      }
    });
  }
};

/**
 * Đăng ký gói hóa đơn điện tử
 * POST /e-invoice/register
 * Sau khi thanh toán thành công, hotel đăng ký packages và cập nhật quota
 */
exports.registerEInvoicePackages = async (req, res) => {
  try {
    const { userId, packages, totalAmount, paymentHistoryId } = req.body;
    const hotelId = req.user?.hotelId?.toString();
    
    if (!userId || !packages || !Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Thiếu thông tin userId hoặc packages'
        }
      });
    }
    
    if (!hotelId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_HOTEL_ID',
          message: 'Không tìm thấy hotelId. Vui lòng đăng nhập lại.'
        }
      });
    }
    
    // Tính tổng số invoice từ các packages
    let totalInvoices = 0;
    const packageList = [];
    
    for (const pkg of packages) {
      const invoiceCount = parseInt(pkg.invoiceCount || 0);
      const quantity = parseInt(pkg.quantity || 1);
      const totalInvoiceCount = invoiceCount * quantity;
      
      if (totalInvoiceCount > 0) {
        totalInvoices += totalInvoiceCount;
        packageList.push({
          packageId: pkg.packageId || pkg.id,
          packageName: pkg.packageName || pkg.name,
          quantity: quantity,
          invoiceCount: invoiceCount,
          totalInvoiceCount: totalInvoiceCount,
          packagePrice: pkg.packagePrice || 0,
          totalPrice: (pkg.packagePrice || 0) * quantity,
          registeredAt: new Date()
        });
      }
    }
    
    if (totalInvoices <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PACKAGES',
          message: 'Tổng số hóa đơn từ các gói phải lớn hơn 0'
        }
      });
    }
    
    // Tìm hoặc tạo hotel quota
    let hotelQuota = await HotelQuota.findOne({ hotelId });
    if (!hotelQuota) {
      hotelQuota = new HotelQuota({
        hotelId,
        allocatedQuota: 0,
        usedQuota: 0,
        remainingQuota: 0,
        packages: [],
        paymentStatus: 'paid'
      });
    }
    
    // Cập nhật hotel quota
    hotelQuota.allocatedQuota = (hotelQuota.allocatedQuota || 0) + totalInvoices;
    hotelQuota.remainingQuota = hotelQuota.allocatedQuota - (hotelQuota.usedQuota || 0);
    
    // Thêm packages vào danh sách
    if (!hotelQuota.packages) {
      hotelQuota.packages = [];
    }
    hotelQuota.packages.push(...packageList);
    
    // Cập nhật payment status nếu có paymentHistoryId
    if (paymentHistoryId) {
      hotelQuota.paymentStatus = 'paid';
      hotelQuota.paidAt = new Date();
    }
    
    await hotelQuota.save();
    
    res.status(200).json({
      success: true,
      data: {
        hotelId,
        allocatedQuota: totalInvoices,
        hotelTotalAllocated: hotelQuota.allocatedQuota,
        hotelRemaining: hotelQuota.remainingQuota,
        packages: packageList
      },
      message: `Đăng ký thành công ${totalInvoices} hóa đơn cho hotel`
    });
  } catch (error) {
    console.error('Error registering e-invoice packages:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTER_PACKAGES_ERROR',
        message: error.message || 'Lỗi khi đăng ký gói hóa đơn điện tử'
      }
    });
  }
};

