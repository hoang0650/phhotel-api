const mongoose = require('mongoose');

const roomEventSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['checkin', 'checkout', 'notpay', 'maintenance', 'service_order', 'transfer', 'booking', 'cancel_booking', 'guest_out', 'guest_return'],
    required: true,
    index: true
  },
  checkinTime: Date,
  checkoutTime: Date,
  expectedCheckoutTime: Date,
  payment: Number,
  totalAmount: Number,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  guestInfo: {
    name: String,
    idNumber: String,
    tax_code: String, // Mã số thuế (cho công ty)
    phone: String,
    email: String,
    address: String,
    guestSource: { 
      type: String, 
      enum: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other'],
      default: 'walkin'
    }
  },
  paymentMethod: { type: String, enum: ['cash', 'card', 'transfer'] },
  paymentStatus: { type: String, enum: ['paid', 'pending'], default: 'paid' }, // Trạng thái thanh toán
  paymentTransactionId: String, // ID giao dịch thanh toán (nếu có)
  rateType: { type: String, enum: ['hourly', 'daily', 'nightly', 'weekly', 'monthly'], default: 'hourly' },
  advancePayment: { type: Number, default: 0 },
  advancePaymentMethod: { type: String, enum: ['cash', 'card', 'transfer'], default: 'cash' }, // Hình thức thanh toán cho trả trước
  additionalCharges: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  notes: String,
  selectedServices: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    price: Number,
    quantity: { type: Number, default: 1 },
    totalPrice: Number,
    orderTime: Date
  }],
  transferredFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  transferredAt: Date,
  transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  cancelledAt: Date,
  cancelReason: String,
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes để query nhanh
roomEventSchema.index({ roomId: 1, createdAt: -1 });
roomEventSchema.index({ hotelId: 1, type: 1, createdAt: -1 });
roomEventSchema.index({ roomId: 1, type: 1, createdAt: -1 });

// Pre-save middleware
roomEventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const RoomEvent = mongoose.model('RoomEvent', roomEventSchema);

module.exports = RoomEvent;

