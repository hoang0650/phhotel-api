const mongoose = require('mongoose');
const { getCache, setCache, generateCacheKey } = require('../config/cacheHelper');

const ROOM_EVENT_CACHE_TTL = 5 * 60; // 5 phút

function getRoomKeyPart(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

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

// Cache nhanh snapshot phòng và thông tin tính tiền gần nhất theo phòng
roomEventSchema.post('save', async function(doc) {
  try {
    const hotelId = getRoomKeyPart(doc.hotelId);
    const roomId = getRoomKeyPart(doc.roomId);
    if (!hotelId || !roomId) return;

    const latestEventKey = generateCacheKey('room:event:latest', hotelId, roomId);
    const billingKey = generateCacheKey('room:billing:latest', hotelId, roomId);

    await setCache(latestEventKey, doc.toObject(), ROOM_EVENT_CACHE_TTL);
    await setCache(billingKey, {
      roomId,
      hotelId,
      totalAmount: doc.totalAmount || 0,
      payment: doc.payment || 0,
      additionalCharges: doc.additionalCharges || 0,
      discount: doc.discount || 0,
      advancePayment: doc.advancePayment || 0,
      paymentStatus: doc.paymentStatus || 'paid',
      paymentMethod: doc.paymentMethod || null,
      updatedAt: new Date().toISOString()
    }, ROOM_EVENT_CACHE_TTL);
  } catch (err) {
    console.error('RoomEvent cache save error:', err.message);
  }
});

roomEventSchema.statics.getLatestRoomEventCached = async function(hotelId, roomId) {
  const key = generateCacheKey('room:event:latest', getRoomKeyPart(hotelId), getRoomKeyPart(roomId));
  const cached = await getCache(key);
  if (cached) return cached;

  const latest = await this.findOne({ hotelId, roomId }).sort({ createdAt: -1 }).lean();
  if (latest) {
    await setCache(key, latest, ROOM_EVENT_CACHE_TTL);
  }
  return latest;
};

roomEventSchema.statics.getRoomBillingSummaryCached = async function(hotelId, roomId) {
  const key = generateCacheKey('room:billing:latest', getRoomKeyPart(hotelId), getRoomKeyPart(roomId));
  const cached = await getCache(key);
  if (cached) return cached;

  const latest = await this.findOne({ hotelId, roomId }).sort({ createdAt: -1 }).lean();
  if (!latest) return null;

  const summary = {
    roomId: getRoomKeyPart(roomId),
    hotelId: getRoomKeyPart(hotelId),
    totalAmount: latest.totalAmount || 0,
    payment: latest.payment || 0,
    additionalCharges: latest.additionalCharges || 0,
    discount: latest.discount || 0,
    advancePayment: latest.advancePayment || 0,
    paymentStatus: latest.paymentStatus || 'paid',
    paymentMethod: latest.paymentMethod || null,
    updatedAt: new Date().toISOString()
  };
  await setCache(key, summary, ROOM_EVENT_CACHE_TTL);
  return summary;
};

const RoomEvent = mongoose.model('RoomEvent', roomEventSchema);

module.exports = RoomEvent;

