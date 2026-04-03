const mongoose = require('mongoose');

/**
 * Model quản lý hạn ngạch hóa đơn điện tử
 * - Tổng quota từ Sepay (system level)
 * - Quota được phân chia cho từng hotel
 */
const eInvoiceQuotaSchema = new mongoose.Schema({
  // Tổng quota từ Sepay (system level - chỉ có 1 record)
  totalQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quota đã sử dụng (system level)
  usedQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quota còn lại (system level)
  remainingQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quota đã phân chia cho các hotel
  allocatedQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quota chưa phân chia (có thể phân chia cho hotel mới)
  unallocatedQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Lần cập nhật cuối từ Sepay
  lastUpdatedFromSepay: {
    type: Date,
    default: Date.now
  },
  // Ghi chú
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Index để đảm bảo chỉ có 1 record system quota
eInvoiceQuotaSchema.index({ _id: 1 }, { unique: true });

/**
 * Model phân chia quota cho từng hotel
 */
const hotelQuotaSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
    unique: true
  },
  // Quota được phân chia cho hotel này
  allocatedQuota: {
    type: Number,
    required: true,
    min: 0
  },
  // Quota đã sử dụng
  usedQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quota còn lại
  remainingQuota: {
    type: Number,
    default: 0,
    min: 0
  },
  // Gói đã đăng ký (từ e-invoice-registration)
  packages: {
    type: [{
      packageId: String,
      packageName: String,
      invoiceCount: Number,
      price: Number,
      registeredAt: Date
    }],
    default: []
  },
  // Deprecated: Giữ lại để tương thích
  packageId: {
    type: String
  },
  packageName: {
    type: String
  },
  invoiceCount: {
    type: Number
  },
  // Trạng thái thanh toán
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'cancelled'],
    default: 'pending'
  },
  // Ngày thanh toán
  paidAt: {
    type: Date
  },
  // Người phân chia quota (admin/superadmin)
  allocatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Ghi chú
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Index để tìm nhanh quota theo hotel
hotelQuotaSchema.index({ hotelId: 1 });
hotelQuotaSchema.index({ paymentStatus: 1 });

// Pre-save middleware để tự động tính remainingQuota
hotelQuotaSchema.pre('save', function(next) {
  this.remainingQuota = Math.max(0, this.allocatedQuota - this.usedQuota);
  next();
});

const EInvoiceQuota = mongoose.model('EInvoiceQuota', eInvoiceQuotaSchema);
const HotelQuota = mongoose.model('HotelQuota', hotelQuotaSchema);

module.exports = {
  EInvoiceQuota,
  HotelQuota
};

