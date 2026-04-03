const mongoose = require('mongoose');

const pricingPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  monthlyPrice: {
    type: Number,
    required: true,
    min: 0
  },
  yearlyPrice: {
    type: Number,
    required: true,
    min: 0
  },
  yearlyDiscount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  // Thời hạn gói tháng (tính bằng tháng) - chỉ superadmin có thể tạo
  monthlyDuration: {
    type: Number,
    min: 1,
    default: null // null = sử dụng duration
  },
  // Thời hạn gói năm (tính bằng tháng) - chỉ superadmin có thể tạo
  yearlyDuration: {
    type: Number,
    min: 1,
    default: null // null = sử dụng duration
  },
  features: [{
    type: String
  }],
  // Tính năng QR thanh toán (tự động bật QR khi thanh toán chuyển khoản trong room nếu gói có tính năng này)
  qrPaymentFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng quản lý OTA (tự động bật quản lý OTA nếu gói có tính năng này)
  otaManagementFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng quản lý email (tự động bật quản lý email nếu gói có tính năng này)
  emailManagementFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng quản lý điện (tự động bật quản lý điện nếu gói có tính năng này)
  electricManagementFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng thanh toán PayPal (tự động bật thanh toán PayPal nếu gói có tính năng này)
  paypalPaymentFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng thanh toán Crypto (tự động bật thanh toán Crypto nếu gói có tính năng này)
  cryptoPaymentFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng xem hóa đơn nháp (tự động bật xem hóa đơn nháp nếu gói có tính năng này)
  draftInvoiceFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng xuất hóa đơn (tự động bật xuất hóa đơn nếu gói có tính năng này)
  exportInvoiceFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng AI Chatbox (tự động bật AI Chatbox nếu gói có tính năng này)
  aiChatboxFeature: {
    type: Boolean,
    default: false
  },
  // Tính năng thông báo khách sạn (tự động bật thông báo khách sạn nếu gói có tính năng này)
  hotelNotificationFeature: {
    type: Boolean,
    default: false
  },
  permissions: [{
    type: String,
    enum: ['view', 'edit', 'delete', 'manage'],
    default: ['view']
  }],
  maxRooms: {
    type: Number,
    default: null,
    validate: {
      validator: function(value) {
        return value === 0 || value === null || (value >= 1);
      },
      message: 'maxRooms phải là 0 (không giới hạn), null, hoặc >= 1'
    }
  },
  maxUsers: {
    type: Number,
    required: true,
    // 0 hoặc null đại diện cho "không giới hạn"
    validate: {
      validator: function(value) {
        return value === 0 || value === null || (value >= 1);
      },
      message: 'maxUsers phải là 0 (không giới hạn), null, hoặc >= 1'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const PricingPackage = mongoose.model('PricingPackage', pricingPackageSchema);
module.exports = PricingPackage; 
