const mongoose = require('mongoose');

const shiftHandoverSchema = new mongoose.Schema({
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  
  // Nhân viên giao ca
  fromStaffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Nhân viên nhận ca
  toStaffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Thời gian giao ca
  handoverTime: {
    type: Date,
    default: Date.now,
    required: true
  },
  shiftStartTime: Date,
  shiftEndTime: Date,
  
  // ============ TÍNH TIỀN GIAO CA ============
  // Công thức: Số tiền giao ca = Số tiền ca trước + Tiền mặt trong ca - Tiền giao quản lý
  
  // Số tiền ca trước (nhận từ ca trước)
  previousShiftAmount: {
    type: Number,
    default: 0
  },
  
  // Tiền mặt trong ca (thu được trong ca)
  cashInShift: {
    type: Number,
    default: 0
  },
  
  // Tiền giao quản lý
  managerHandoverAmount: {
    type: Number,
    default: 0
  },
  
  // Số tiền thực nhận trong ca = previousShiftAmount + cashInShift - managerHandoverAmount
  actualReceivedAmount: {
    type: Number,
    default: 0
  },
  
  // Số tiền giao ca (truyền cho ca sau)
  handoverAmount: {
    type: Number,
    required: true
  },
  
  // ============ THÔNG TIN DOANH THU ============
  // Tiền mặt để quản lý số tiền chênh lệch giao ca
  cashAmount: {
    type: Number,
    required: true
  },
  
  // Tiền chuyển khoản (vào túi chủ/quản lý - chỉ tính doanh thu)
  bankTransferAmount: {
    type: Number,
    default: 0
  },
  
  // Tiền cà thẻ (vào túi chủ/quản lý - chỉ tính doanh thu)  
  cardPaymentAmount: {
    type: Number,
    default: 0
  },
  
  // Tiền chi (phiếu chi)
  expenseAmount: {
    type: Number,
    default: 0
  },
  
  // Tiền thu (phiếu thu)
  incomeAmount: {
    type: Number,
    default: 0
  },
  
  // Tổng doanh thu = tiền mặt + chuyển khoản + cà thẻ - tiền chi = phiếu thu - phiếu chi
  totalRevenue: {
    type: Number,
    default: 0
  },
  
  // Tổng tiền phòng trong ca
  totalRoomRevenue: {
    type: Number,
    default: 0
  },
  
  // ============ LỊCH SỬ PHÒNG TRONG CA ============
  roomHistory: [{
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    roomNumber: String,
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    action: { 
      type: String, 
      enum: ['check_in', 'check_out', 'extend', 'early_checkout', 'room_change'] 
    },
    guestName: String,
    guestSource: String,
    amount: Number,
    paymentMethod: { 
      type: String, 
      enum: ['cash', 'bank_transfer', 'card'] 
    },
    advancePaymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'card'],
      default: 'cash'
    },
    timestamp: { type: Date, default: Date.now },
    notes: String,
    // Các trường bổ sung cho chi tiết
    roomTotal: { type: Number, default: 0 },        // Tiền phòng
    additionalCharges: { type: Number, default: 0 }, // Phụ thu
    discount: { type: Number, default: 0 },          // Khuyến mãi
    serviceAmount: { type: Number, default: 0 },     // Tiền dịch vụ
    advancePayment: { type: Number, default: 0 },    // Tiền đặt trước
    checkinTime: { type: Date }                      // Thời gian nhận phòng
  }],
  
  // ============ HÓA ĐƠN TRONG CA ============
  invoices: [{
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: String,
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    roomNumber: String,
    guestName: String,
    amount: Number,
    paymentMethod: { 
      type: String, 
      enum: ['cash', 'bank_transfer', 'card'] 
    },
    type: { type: String, enum: ['room', 'service', 'other'] },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // ============ PHIẾU CHI TRONG CA ============
  expenses: [{
    expenseId: { type: mongoose.Schema.Types.ObjectId },
    description: String,
    amount: Number,
    category: String,
    recipient: String,
    method: { type: String, enum: ['cash', 'bank_transfer', 'card'], default: 'cash' }, // Phương thức thanh toán
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // ============ PHIẾU THU TRONG CA ============
  incomes: [{
    incomeId: { type: mongoose.Schema.Types.ObjectId },
    description: String,
    amount: Number,
    category: String,
    source: String,
    method: { type: String, enum: ['cash', 'bank_transfer', 'card'], default: 'cash' }, // Phương thức thanh toán
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // ============ DỊCH VỤ TRONG CA ============
  serviceOrders: [{
    serviceOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceOrder' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    roomNumber: String,
    serviceName: String,
    quantity: Number,
    amount: Number,
    paymentMethod: { 
      type: String, 
      enum: ['cash', 'bank_transfer', 'card'] 
    },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // ============ XÁC NHẬN GIAO CA ============
  confirmedByPassword: {
    type: Boolean,
    default: false
  },
  confirmed: {
    type: Boolean,
    default: false
  },
  confirmedAt: Date,
  
  // Ghi chú và notes
  notes: {
    type: String
  },
  
  // Thông tin bổ sung
  pendingIssues: [{
    description: String,
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Trạng thái giao ca
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  // Lý do từ chối (nếu có)
  rejectionReason: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index cho tìm kiếm nhanh
shiftHandoverSchema.index({ hotelId: 1, handoverTime: -1 });
shiftHandoverSchema.index({ fromStaffId: 1, handoverTime: -1 });
shiftHandoverSchema.index({ toStaffId: 1, handoverTime: -1 });

// Pre-save middleware
shiftHandoverSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Tính số tiền thực nhận trong ca
  this.actualReceivedAmount = this.previousShiftAmount + this.cashInShift - this.managerHandoverAmount;
  
  // Tính số tiền giao ca
  this.handoverAmount = this.previousShiftAmount + this.cashInShift - this.managerHandoverAmount;
  
  // Tính tổng doanh thu = tiền mặt + chuyển khoản + cà thẻ - tiền chi
  this.totalRevenue = this.cashAmount + this.bankTransferAmount + this.cardPaymentAmount - this.expenseAmount;
  
  next();
});

// Virtual để lấy tóm tắt
shiftHandoverSchema.virtual('summary').get(function() {
  return {
    handoverAmount: this.handoverAmount,
    totalRevenue: this.totalRevenue,
    totalRooms: this.roomHistory?.length || 0,
    totalInvoices: this.invoices?.length || 0,
    totalExpenses: this.expenseAmount,
    totalIncomes: this.incomeAmount
  };
});

shiftHandoverSchema.set('toJSON', { virtuals: true });
shiftHandoverSchema.set('toObject', { virtuals: true });

const ShiftHandover = mongoose.model('ShiftHandover', shiftHandoverSchema);

module.exports = ShiftHandover;
