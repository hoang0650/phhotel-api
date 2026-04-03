const express = require('express');
const router = express.Router();
const PricingPackage = require('../models/pricingPackage');
const { User } = require('../models/users');
const { 
  authenticateToken, 
  authorizeRoles
} = require('../middlewares/auth');
const { sendEmailTemplate, sendEmail: sendEmailAdapter, EMAIL_PROVIDER } = require('../config/emailServiceAdapter');
const { Settings } = require('../models/settings');

// Lấy danh sách quyền có sẵn
router.get('/permissions', authenticateToken, authorizeRoles(['superadmin', 'admin']), (req, res) => {
  res.json(['view', 'edit', 'delete', 'manage']);
});

// Lấy gói của user hiện tại (PHẢI đặt trước /:id để tránh conflict)
router.get('/user/:userId', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest']), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Kiểm tra quyền: user chỉ có thể xem gói của chính mình, admin có thể xem tất cả
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      if (req.user._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn chỉ có thể xem gói của chính mình'
        });
      }
    }

    const user = await User.findById(userId)
      .populate('pricingPackage')
      .select('pricingPackage packageExpiryDate billingType');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    if (!user.pricingPackage) {
      return res.json({
        success: true,
        data: null,
        message: 'Người dùng chưa đăng ký gói nào'
      });
    }

    res.json({
      success: true,
      data: user.pricingPackage,
      expiryDate: user.packageExpiryDate,
      billingType: user.billingType || 'monthly'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin gói của người dùng',
      error: error.message
    });
  }
});

// Lấy tất cả các gói (không cần đăng nhập)
router.get('/', async (req, res) => {
  try {
    // Chỉ lấy các gói đang active
    const packages = await PricingPackage.find({ isActive: true }).sort({ monthlyPrice: 1 });
    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Lỗi khi lấy danh sách gói',
      error: error.message 
    });
  }
});

// Lấy chi tiết một gói (không cần đăng nhập)
router.get('/:id', async (req, res) => {
  try {
    const package = await PricingPackage.findById(req.params.id);
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy gói'
      });
    }
    res.json({
      success: true,
      data: package
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin gói',
      error: error.message
    });
  }
});

// Tạo gói mới
router.post('/', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const { 
      name, description, monthlyPrice, yearlyPrice, yearlyDiscount, duration, monthlyDuration, yearlyDuration, 
      features, permissions, maxUsers, maxRooms, isActive,
      qrPaymentFeature, otaManagementFeature, emailManagementFeature, electricManagementFeature,
      paypalPaymentFeature, cryptoPaymentFeature, draftInvoiceFeature, exportInvoiceFeature,
      aiChatboxFeature, hotelNotificationFeature
    } = req.body;

    // Kiểm tra các trường bắt buộc
    // Nếu là superadmin và có monthlyDuration/yearlyDuration, không cần duration
    const isSuperAdmin = req.user.role === 'superadmin';
    const hasCustomDurations = monthlyDuration !== undefined || yearlyDuration !== undefined;
    
    let requiredFields = ['name', 'description', 'monthlyPrice', 'yearlyPrice', 'maxUsers'];
    if (!isSuperAdmin || !hasCustomDurations) {
      requiredFields.push('duration');
    }
    
    const missingFields = requiredFields.filter(field => !req.body[field] && req.body[field] !== 0);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Vui lòng điền đầy đủ thông tin: ${missingFields.join(', ')}`
      });
    }

    // Kiểm tra giá trị hợp lệ
    if (monthlyPrice < 0 || yearlyPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá không được nhỏ hơn 0'
      });
    }

    if (yearlyDiscount < 0 || yearlyDiscount > 100) {
      return res.status(400).json({
        success: false,
        message: 'Giảm giá phải từ 0 đến 100%'
      });
    }

    // Kiểm tra duration (nếu có)
    if (duration !== undefined && duration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Thời hạn phải lớn hơn hoặc bằng 1 tháng'
      });
    }

    // Kiểm tra monthlyDuration và yearlyDuration (nếu có)
    if (monthlyDuration !== undefined && monthlyDuration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Thời hạn gói tháng phải lớn hơn hoặc bằng 1 tháng'
      });
    }

    if (yearlyDuration !== undefined && yearlyDuration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Thời hạn gói năm phải lớn hơn hoặc bằng 1 tháng'
      });
    }

    // Cho phép maxUsers = 0 (không giới hạn) hoặc >= 1
    if (maxUsers !== 0 && maxUsers !== null && maxUsers < 1) {
      return res.status(400).json({
        success: false,
        message: 'Số người dùng tối đa phải là 0 (không giới hạn) hoặc >= 1'
      });
    }
    
    // Cho phép maxRooms = 0 (không giới hạn) hoặc >= 1
    if (maxRooms !== undefined) {
      if (maxRooms !== 0 && maxRooms !== null && maxRooms < 1) {
        return res.status(400).json({
          success: false,
          message: 'Số phòng tối đa phải là 0 (không giới hạn) hoặc >= 1'
        });
      }
    }

    const newPackage = new PricingPackage({
      name,
      description,
      monthlyPrice,
      yearlyPrice,
      yearlyDiscount: yearlyDiscount || 0,
      duration: duration || (monthlyDuration && yearlyDuration ? Math.max(monthlyDuration, yearlyDuration) : 1), // Fallback
      monthlyDuration: isSuperAdmin && monthlyDuration !== undefined ? monthlyDuration : null,
      yearlyDuration: isSuperAdmin && yearlyDuration !== undefined ? yearlyDuration : null,
      features: features || [],
      permissions: permissions || ['view'],
      maxUsers,
      maxRooms: maxRooms !== undefined ? maxRooms : null,
      isActive: isActive !== undefined ? isActive : true,
      qrPaymentFeature: !!qrPaymentFeature,
      otaManagementFeature: !!otaManagementFeature,
      emailManagementFeature: !!emailManagementFeature,
      electricManagementFeature: !!electricManagementFeature,
      paypalPaymentFeature: !!paypalPaymentFeature,
      cryptoPaymentFeature: !!cryptoPaymentFeature,
      draftInvoiceFeature: !!draftInvoiceFeature,
      exportInvoiceFeature: !!exportInvoiceFeature,
      aiChatboxFeature: !!aiChatboxFeature,
      hotelNotificationFeature: !!hotelNotificationFeature
    });

    await newPackage.save();
    res.status(201).json({
      success: true,
      message: 'Tạo gói thành công',
      data: newPackage
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Tên gói đã tồn tại',
        error: error.message
      });
    }
    res.status(400).json({
      success: false,
      message: 'Lỗi khi tạo gói',
      error: error.message
    });
  }
});

// Cập nhật gói
router.put('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const { 
      name, description, monthlyPrice, yearlyPrice, yearlyDiscount, duration, monthlyDuration, yearlyDuration, 
      features, permissions, maxUsers, maxRooms, isActive,
      qrPaymentFeature, otaManagementFeature, emailManagementFeature, electricManagementFeature,
      paypalPaymentFeature, cryptoPaymentFeature, draftInvoiceFeature, exportInvoiceFeature,
      aiChatboxFeature, hotelNotificationFeature
    } = req.body;
    
    const package = await PricingPackage.findById(req.params.id);
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy gói'
      });
    }

    const isSuperAdmin = req.user.role === 'superadmin';

    // Kiểm tra giá trị hợp lệ
    if (monthlyPrice !== undefined && monthlyPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá tháng không được nhỏ hơn 0'
      });
    }

    if (yearlyPrice !== undefined && yearlyPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Giá năm không được nhỏ hơn 0'
      });
    }

    if (yearlyDiscount !== undefined && (yearlyDiscount < 0 || yearlyDiscount > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Giảm giá phải từ 0 đến 100%'
      });
    }

    // Kiểm tra duration (nếu có)
    if (duration !== undefined && duration < 1) {
      return res.status(400).json({
        success: false,
        message: 'Thời hạn phải lớn hơn hoặc bằng 1 tháng'
      });
    }

    // Kiểm tra monthlyDuration và yearlyDuration (nếu có và là superadmin)
    if (isSuperAdmin) {
      if (monthlyDuration !== undefined) {
        if (monthlyDuration < 1) {
          return res.status(400).json({
            success: false,
            message: 'Thời hạn gói tháng phải lớn hơn hoặc bằng 1 tháng'
          });
        }
      }
      
      if (yearlyDuration !== undefined) {
        if (yearlyDuration < 1) {
          return res.status(400).json({
            success: false,
            message: 'Thời hạn gói năm phải lớn hơn hoặc bằng 1 tháng'
          });
        }
      }
    }

    // Kiểm tra maxUsers nếu được cập nhật
    if (maxUsers !== undefined) {
      // Cho phép maxUsers = 0 (không giới hạn) hoặc >= 1
      if (maxUsers !== 0 && maxUsers !== null && maxUsers < 1) {
        return res.status(400).json({
          success: false,
          message: 'Số người dùng tối đa phải là 0 (không giới hạn) hoặc >= 1'
        });
      }
    }
    
    // Kiểm tra maxRooms nếu được cập nhật
    if (maxRooms !== undefined) {
      // Cho phép maxRooms = 0 (không giới hạn) hoặc >= 1
      if (maxRooms !== 0 && maxRooms !== null && maxRooms < 1) {
        return res.status(400).json({
          success: false,
          message: 'Số phòng tối đa phải là 0 (không giới hạn) hoặc >= 1'
        });
      }
    }

    // Cập nhật thông tin
    if (name) package.name = name;
    if (description) package.description = description;
    if (monthlyPrice !== undefined) package.monthlyPrice = monthlyPrice;
    if (yearlyPrice !== undefined) package.yearlyPrice = yearlyPrice;
    if (yearlyDiscount !== undefined) package.yearlyDiscount = yearlyDiscount;
    if (duration !== undefined) package.duration = duration;
    
    // Chỉ superadmin mới có thể cập nhật monthlyDuration và yearlyDuration
    if (isSuperAdmin) {
      if (monthlyDuration !== undefined) package.monthlyDuration = monthlyDuration;
      if (yearlyDuration !== undefined) package.yearlyDuration = yearlyDuration;
    }
    
    if (features) package.features = features;
    if (permissions) package.permissions = permissions;
    if (maxUsers !== undefined) package.maxUsers = maxUsers;
    if (maxRooms !== undefined) package.maxRooms = maxRooms;
    if (isActive !== undefined) package.isActive = isActive;
    if (qrPaymentFeature !== undefined) package.qrPaymentFeature = qrPaymentFeature;
    if (otaManagementFeature !== undefined) package.otaManagementFeature = otaManagementFeature;
    if (emailManagementFeature !== undefined) package.emailManagementFeature = emailManagementFeature;
    if (electricManagementFeature !== undefined) package.electricManagementFeature = electricManagementFeature;
    if (paypalPaymentFeature !== undefined) package.paypalPaymentFeature = paypalPaymentFeature;
    if (cryptoPaymentFeature !== undefined) package.cryptoPaymentFeature = cryptoPaymentFeature;
    if (draftInvoiceFeature !== undefined) package.draftInvoiceFeature = draftInvoiceFeature;
    if (exportInvoiceFeature !== undefined) package.exportInvoiceFeature = exportInvoiceFeature;
    if (aiChatboxFeature !== undefined) package.aiChatboxFeature = aiChatboxFeature;
    if (hotelNotificationFeature !== undefined) package.hotelNotificationFeature = hotelNotificationFeature;
    package.updatedAt = Date.now();

    const updatedPackage = await package.save();
    res.json({
      success: true,
      message: 'Cập nhật gói thành công',
      data: updatedPackage
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Tên gói đã tồn tại',
        error: error.message
      });
    }
    res.status(400).json({
      success: false,
      message: 'Lỗi khi cập nhật gói',
      error: error.message
    });
  }
});

// Xóa gói
router.delete('/:id', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const package = await PricingPackage.findById(req.params.id);
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy gói'
      });
    }

    await package.deleteOne();
    res.json({
      success: true,
      message: 'Xóa gói thành công'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa gói',
      error: error.message
    });
  }
});

// Lấy danh sách người đăng ký
router.get('/subscribers/all', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const users = await User.find({ pricingPackage: { $ne: null } })
      .populate('pricingPackage')
      .select('username email pricingPackage packageExpiryDate paymentInfo businessId');

    // Lấy thông tin số lượng nhân viên cho mỗi business
    const subscribers = await Promise.all(users.map(async (user) => {
      // Lấy ngày đăng ký từ paymentInfo.paymentDate hoặc tính từ expiryDate và duration
      let subscriptionDate = null;
      
      if (user.paymentInfo && user.paymentInfo.paymentDate) {
        subscriptionDate = user.paymentInfo.paymentDate;
      } else if (user.packageExpiryDate && user.pricingPackage) {
        // Tính ngược lại từ expiryDate và duration
        const expiryDate = new Date(user.packageExpiryDate);
        const duration = user.pricingPackage.duration || user.pricingPackage.monthlyDuration || user.pricingPackage.yearlyDuration || 1;
        subscriptionDate = new Date(expiryDate.getTime() - duration * 30 * 24 * 60 * 60 * 1000);
      }
      
      // Đếm số lượng nhân viên (staff) của business này
      let staffCount = 0;
      let maxUsers = null;
      
      if (user.businessId) {
        staffCount = await User.countDocuments({ 
          businessId: user.businessId, 
          role: 'staff',
          status: { $ne: 'deleted' } // Không đếm các user đã bị xóa
        });
        
        // Lấy maxUsers từ package
        if (user.pricingPackage) {
          maxUsers = user.pricingPackage.maxUsers;
        }
      }
      
      return {
        userId: user._id,
        username: user.username,
        email: user.email,
        packageId: user.pricingPackage?._id,
        packageName: user.pricingPackage?.name,
        expiryDate: user.packageExpiryDate,
        subscriptionDate: subscriptionDate,
        staffCount: staffCount,
        maxUsers: maxUsers
      };
    }));

    res.json({
      success: true,
      data: subscribers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách người đăng ký',
      error: error.message
    });
  }
});

// Đăng ký gói
router.post('/subscribe', authenticateToken, authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest']), async (req, res) => {
  try {
    const { userId, packageId, billingType, paymentId, paymentMethod } = req.body;
    const currentUser = req.user;

    // Validate input
    if (!userId || !packageId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp userId và packageId'
      });
    }

    // Non-admin chỉ có thể subscribe cho chính mình
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin') {
      const currentUserId = currentUser._id ? (currentUser._id.toString ? currentUser._id.toString() : currentUser._id) : null;
      const requestUserId = userId.toString ? userId.toString() : userId;
      
      if (currentUserId !== requestUserId) {
        return res.status(403).json({
          success: false,
          message: 'Bạn chỉ có thể đăng ký/nâng cấp/hạ cấp gói cho chính mình'
        });
      }
    }

    // Validate billingType
    if (billingType && billingType !== 'monthly' && billingType !== 'yearly') {
      return res.status(400).json({
        success: false,
        message: 'billingType phải là "monthly" hoặc "yearly"'
      });
    }

    const package = await PricingPackage.findById(packageId);
    if (!package) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy gói'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    // Tính thời hạn dựa trên billingType
    // Ưu tiên: monthlyDuration/yearlyDuration (nếu có) > duration mặc định
    let subscriptionDuration = package.duration; // Mặc định
    
    if (billingType === 'yearly') {
      // Nếu có yearlyDuration, dùng nó; nếu không, dùng duration hoặc 12 tháng
      subscriptionDuration = package.yearlyDuration || package.duration || 12;
    } else if (billingType === 'monthly') {
      // Nếu có monthlyDuration, dùng nó; nếu không, dùng duration hoặc 1 tháng
      subscriptionDuration = package.monthlyDuration || package.duration || 1;
    }

    // Cập nhật thông tin gói cho user
    user.pricingPackage = packageId;
    user.packageExpiryDate = new Date(Date.now() + subscriptionDuration * 30 * 24 * 60 * 60 * 1000);
    user.billingType = billingType || 'monthly'; // Lưu billingType
    
    // Nếu user là 'guest', cập nhật role lên 'business' khi đăng ký gói
    if (user.role === 'guest') {
      user.role = 'business';
    }
    
    // Lưu thông tin thanh toán (luôn lưu paymentDate để biết ngày đăng ký)
    if (!user.paymentInfo) {
      user.paymentInfo = {};
    }
    
    if (paymentId || paymentMethod) {
      user.paymentInfo.paymentId = paymentId || null;
      user.paymentInfo.paymentMethod = paymentMethod || null;
    }
    
    // Luôn cập nhật paymentDate khi đăng ký/gia hạn gói
    user.paymentInfo.paymentDate = new Date();
    
    await user.save();

    try {
      const toEmail = user.email;
      // Lấy email settings từ database nếu có
      let emailSettings = null;
      try {
        const settingsDoc = await Settings.findOne();
        emailSettings = settingsDoc?.emailSettings || null;
      } catch (e) {
        emailSettings = null;
      }
      const provider = (emailSettings?.emailProvider || process.env.EMAIL_PROVIDER || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
      const templateId = emailSettings?.resendTemplateSubscriptionId || emailSettings?.resendTemplateSubscriptionAlias || process.env.RESEND_TEMPLATE_SUBSCRIPTION_SUCCESS_ID || process.env.RESEND_TEMPLATE_SUBSCRIPTION_ALIAS;
      const fromEmail = emailSettings?.emailFrom || process.env.EMAIL_FROM || '';
      if (toEmail) {
        if (provider === 'resend' && templateId) {
          const price =
            (billingType === 'yearly' ? package.yearlyPrice : package.monthlyPrice) ??
            package.monthlyPrice ??
            0;
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
          const priceStr =
            (billingType === 'yearly' ? package.yearlyPrice : package.monthlyPrice) ??
            package.monthlyPrice ??
            0;
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
      console.warn('Warning: Unable to send subscription success email:', emailError.message);
    }

    res.json({
      success: true,
      message: `Đăng ký gói ${billingType === 'yearly' ? 'theo năm' : 'theo tháng'} thành công`,
      data: {
        user,
        billingType: billingType || 'monthly',
        expiryDate: user.packageExpiryDate,
        paymentId: paymentId || null,
        paymentMethod: paymentMethod || null
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi đăng ký gói',
      error: error.message
    });
  }
});

// Gửi thông báo nhắc nhở thanh toán
router.post('/send-payment-reminder', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUser = req.user;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp userId'
      });
    }

    // Lấy thông tin user
    const user = await User.findById(userId)
      .populate('pricingPackage')
      .populate('businessId')
      .populate('hotelId');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    if (!user.pricingPackage) {
      return res.status(400).json({
        success: false,
        message: 'Người dùng chưa đăng ký gói nào'
      });
    }

    // Tính số ngày còn lại đến ngày hết hạn
    const now = new Date();
    const expiryDate = new Date(user.packageExpiryDate);
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    // Tạo thông báo nhắc nhở
    const { Settings } = require('../models/settings');
    const mongoose = require('mongoose');
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings();
    }

    const announcementId = new mongoose.Types.ObjectId().toString();
    
    // Thông báo nhắc nhở thanh toán là thông báo hệ thống
    // Không cần xác định targetBusinesses và targetHotels vì là thông báo hệ thống

    const packageName = user.pricingPackage.name || 'gói dịch vụ';
    const expiryDateStr = expiryDate.toLocaleDateString('vi-VN');
    
    const reminderMessage = daysRemaining > 0 
      ? `Gói ${packageName} của bạn sẽ hết hạn sau ${daysRemaining} ngày (${expiryDateStr}). Vui lòng thanh toán để tiếp tục sử dụng dịch vụ.`
      : `Gói ${packageName} của bạn đã hết hạn vào ngày ${expiryDateStr}. Vui lòng thanh toán ngay để tiếp tục sử dụng dịch vụ.`;

    const paymentReminderAnnouncement = {
      id: announcementId,
      type: daysRemaining <= 7 ? 'warning' : 'info',
      title: daysRemaining > 0 
        ? `Nhắc nhở thanh toán gói ${packageName}`
        : `Gói ${packageName} đã hết hạn`,
      message: reminderMessage,
      priority: daysRemaining <= 7 ? 'high' : 'medium',
      startDate: new Date(),
      endDate: new Date(expiryDate.getTime() + 7 * 24 * 60 * 60 * 1000), // Thông báo hết hạn sau 7 ngày kể từ ngày hết hạn gói
      isActive: true,
      targetRoles: [], // Thông báo hệ thống - gửi cho tất cả roles
      targetBusinesses: [], // Thông báo hệ thống - không giới hạn theo business
      targetHotels: [], // Thông báo hệ thống - không giới hạn theo hotel
      targetType: 'system', // Thông báo hệ thống
      notificationType: 'payment', // Loại thông báo thanh toán
      userId: user._id, // User ID của người dùng cần thanh toán
      createdAt: new Date(),
      createdBy: currentUser._id
    };

    if (!settings.announcements) {
      settings.announcements = [];
    }

    settings.announcements.push(paymentReminderAnnouncement);
    await settings.save();

    // Gửi email nhắc gia hạn gói (Resend Template nếu có)
    try {
      const toEmail = user.email;
      // Lấy email settings
      const emailSettings = settings?.emailSettings || null;
      const provider = (emailSettings?.emailProvider || process.env.EMAIL_PROVIDER || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
      const fromEmail = emailSettings?.emailFrom || process.env.EMAIL_FROM || '';
      const appName = process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel';
      const backendUrl = process.env.BACKEND_PUBLIC_URL || process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
      const logoUrl = `${backendUrl}/images/phgroup_logo_circle.PNG`;
      const renewUrl = `${process.env.APP_URL || 'http://localhost:4200'}/pricing`;
      const remainingDaysDisplay = Math.max(daysRemaining, 0);
      const templateId = emailSettings?.resendTemplateRenewReminderId 
        || emailSettings?.resendTemplateRenewReminderAlias 
        || process.env.RESEND_TEMPLATE_RENEW_REMINDER_ID 
        || process.env.RESEND_TEMPLATE_RENEW_REMINDER_ALIAS;
      
      if (toEmail) {
        if (provider === 'resend' && templateId) {
          const variables = {
            logoUrl,
            appName,
            userName: user.username || user.email || '',
            packageName,
            expireDate: expiryDate.toLocaleDateString('vi-VN'),
            remainingDays: remainingDaysDisplay,
            renewUrl
          };
          const overrides = { from: fromEmail, subject: '⏳ Gói sắp hết hạn – Gia hạn ngay' };
          await sendEmailTemplate(toEmail, templateId, variables, overrides, emailSettings || undefined);
        } else {
          const subject = '⏳ Gói sắp hết hạn – Gia hạn ngay';
          const html = `
            <table width="100%" cellpadding="0" cellspacing="0"> 
              <tr> 
                <td align="center" style="padding:40px 0;"> 
                  <table width="600" style="background:#ffffff;border-radius:8px;padding:32px;"> 
                    <tr> 
                      <td align="center" style="padding-bottom:24px;"> 
                        <img src="${logoUrl}" alt="${appName}" 
                             style="max-width:160px;height:auto;display:block;" /> 
                      </td> 
                    </tr> 
                    <tr> 
                      <td align="center"> 
                        <h2 style="color:#f59e0b;margin:0;">⏳ Gói sắp hết hạn</h2> 
                      </td> 
                    </tr> 
                    <tr> 
                      <td style="color:#555;font-size:15px;line-height:1.6; 
                                 padding-top:16px;text-align:center;"> 
                        Chào <b>${user.username || user.email}</b>,<br /><br /> 
                        Gói dịch vụ của bạn tại <b>${appName}</b> sắp hết hạn. 
                      </td> 
                    </tr> 
                    <tr> 
                      <td align="center" style="padding:16px;"> 
                        <table width="100%" style="background:#fef3c7;border-radius:6px;padding:16px;"> 
                          <tr> 
                            <td style="font-size:14px;color:#92400e;text-align:left;"> 
                              <b>📦 Gói:</b> ${packageName}<br /> 
                              <b>📅 Ngày hết hạn:</b> ${expiryDate.toLocaleDateString('vi-VN')}<br /> 
                              <b>⏰ Còn lại:</b> ${remainingDaysDisplay} ngày 
                            </td> 
                          </tr> 
                        </table> 
                      </td> 
                    </tr> 
                    <tr> 
                      <td style="font-size:14px;color:#555;text-align:center;"> 
                        Để tránh gián đoạn dịch vụ, vui lòng gia hạn trước khi gói hết hạn. 
                      </td> 
                    </tr> 
                    <tr> 
                      <td align="center" style="padding:24px 0;"> 
                        <a href="${renewUrl}" 
                           style="background:#f59e0b;color:#fff;text-decoration:none; 
                                  padding:14px 28px;border-radius:6px; 
                                  display:inline-block;font-weight:bold;"> 
                          Gia hạn ngay 
                        </a> 
                      </td> 
                    </tr> 
                    <tr> 
                      <td style="font-size:13px;color:#777;text-align:center;"> 
                        Nếu bạn đã gia hạn, vui lòng bỏ qua email này. 
                      </td> 
                    </tr> 
                    <tr> 
                      <td style="padding-top:24px;font-size:12px;color:#aaa;text-align:center;"> 
                        © ${appName} • Email hệ thống 
                      </td> 
                    </tr> 
                  </table> 
                </td> 
              </tr> 
            </table>
          `;
          const text = `Gói sắp hết hạn

Chào ${user.username || user.email},
Gói ${packageName} của bạn tại ${appName} sắp hết hạn.
Ngày hết hạn: ${expiryDate.toLocaleDateString('vi-VN')}
Còn lại: ${remainingDaysDisplay} ngày

Gia hạn ngay: ${renewUrl}

Nếu bạn đã gia hạn, vui lòng bỏ qua email này.
© ${appName} • Email hệ thống`;
          await sendEmailAdapter(toEmail, subject, html, text, fromEmail, emailSettings || undefined);
        }
      }
    } catch (emailError) {
      console.warn('Warning: Unable to send renewal reminder email:', emailError.message);
    }

    res.json({
      success: true,
      message: `Đã gửi thông báo nhắc nhở thanh toán đến ${user.username}`,
      data: {
        announcementId,
        daysRemaining,
        expiryDate: expiryDateStr
      }
    });
  } catch (error) {
    console.error('Error sending payment reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi gửi thông báo nhắc nhở',
      error: error.message
    });
  }
});

// Hủy đăng ký gói
router.post('/cancel', authenticateToken, authorizeRoles(['superadmin', 'admin']), async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp userId'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    user.pricingPackage = null;
    user.packageExpiryDate = null;
    await user.save();

    res.json({
      success: true,
      message: 'Hủy đăng ký gói thành công'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi hủy đăng ký gói',
      error: error.message
    });
  }
});

module.exports = router; 
