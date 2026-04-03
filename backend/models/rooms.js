// roomSchema.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
  roomNumber: { type: String, required: true },
  floor: { type: String, required: true },
  type: { type: String, required: true },
  capacity: {
    adults: { type: Number, default: 2 },
    children: { type: Number, default: 0 }
  },
  amenities: [String],
  images: [String],
  status: {
    type: String,
    enum: ['vacant', 'occupied', 'cleaning', 'dirty', 'maintenance', 'booked'],
    default: 'vacant',
    required: true
  },
  guestStatus: {
    type: String,
    enum: ['in', 'out'],
    default: null // Không có default, chỉ set khi phòng occupied
  },
  pricing: {
    hourly: Number,
    daily: Number,
    nightly: Number,
    weekly: Number,
    monthly: Number,
    currency: { type: String, default: 'VND' }
  },
  // Giá giờ đầu và giờ tiếp theo
  firstHourRate: Number,
  additionalHourRate: Number,
  priceConfigId: { type: mongoose.SchemaTypes.ObjectId, ref: 'PriceConfig' },
  roomCategoryId: { type: mongoose.SchemaTypes.ObjectId, ref: 'RoomCategory' },
  // Cấu hình tính giá cho phòng
  priceSettings: {
    nightlyStartTime: { type: String, default: '22:00' }, // Giờ bắt đầu tính qua đêm (HH:mm)
    nightlyEndTime: { type: String, default: '06:00' }, // Giờ kết thúc tính qua đêm (HH:mm)
    dailyStartTime: { type: String, default: '06:00' }, // Giờ bắt đầu tính theo ngày (HH:mm)
    dailyEndTime: { type: String, default: '22:00' }, // Giờ kết thúc tính theo ngày (HH:mm)
    autoNightlyHours: { type: Number, default: 8 }, // Số giờ tự động chuyển sang tính qua đêm
    gracePeriodMinutes: { type: Number, default: 15 }, // Thời gian miễn phí sau giờ thứ 2 (phút)
    timezone: { type: String, default: 'UTC+7' }, // Múi giờ (UTC+7 cho Việt Nam)
    // Phụ thu cho daily rates
    dailyEarlyCheckinSurcharge: { type: Number, default: 0 }, // Phụ thu check-in sớm cho thuê theo ngày (số tiền/giờ)
    dailyLateCheckoutFee: { type: Number, default: 0 }, // Phí trả phòng muộn cho thuê theo ngày (số tiền/giờ)
    // Phụ thu cho nightly rates
    nightlyEarlyCheckinSurcharge: { type: Number, default: 0 }, // Phụ thu check-in sớm cho thuê qua đêm (số tiền/giờ)
    nightlyLateCheckoutSurcharge: { type: Number, default: 0 } // Phụ thu check-out trễ cho thuê qua đêm (số tiền/giờ)
  },
  specialPricing: [
    {
      startDate: Date,
      endDate: Date,
      hourly: Number,
      daily: Number,
      nightly: Number,
      weekly: Number,
      monthly: Number,
      reason: { type: String, enum: ['season', 'holiday', 'promotion', 'other'] }
    }
  ],
  lastCleaned: Date,
  lastMaintenance: Date,
  description: String,
  notes: String,
  services: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Service' }],
  revenue: {
    total: { type: Number, default: 0 },
    history: [{
      date: { type: Date },
      amount: { type: Number, default: 0 },
      bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking' }
    }]
  },
  // DEPRECATED: Events đã được chuyển sang RoomEvent collection riêng
  // Tất cả events (checkin, checkout, booking, etc.) giờ được lưu trong RoomEvent model
  // Giữ lại field này để backward compatibility với dữ liệu cũ, nhưng không còn được sử dụng nữa
  // Sử dụng RoomEvent.find({ roomId: room._id }) để lấy events thay vì room.events
  events: {
    type: [{
      type: {
        type: String,
        enum: ['checkin', 'checkout', 'notpay', 'maintenance', 'service_order', 'transfer', 'booking', 'cancel_booking', 'guest_out', 'guest_return'],
        required: true
      },
      checkinTime: Date,
      checkoutTime: Date,
      expectedCheckoutTime: Date,
      payment: Number,
      userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
      staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
      guestInfo: {
        name: String,
        idNumber: String,
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
      rateType: { type: String, enum: ['hourly', 'daily', 'nightly', 'weekly', 'monthly'], default: 'hourly' },
      advancePayment: { type: Number, default: 0 },
      additionalCharges: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      notes: String,
      selectedServices: [{
        serviceId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Service' },
        serviceName: String,
        price: Number,
        quantity: { type: Number, default: 1 },
        totalPrice: Number,
        orderTime: Date
      }],
      transferredFrom: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' },
      transferredAt: Date,
      transferredBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' }
    }],
    default: [],
    select: false // Không tự động load field này khi query để tối ưu performance
  },
  currentBooking: {
    type: mongoose.Schema.Types.Mixed, // Hỗ trợ cả ObjectId và object
    default: null
  },
  bookingHistory: [
    {
      event: {
        type: String,
        enum: ['check-in', 'check-out', 'payment', 'maintenance', 'cleaning', 'service', 'transfer', 'booking', 'cancel_booking'],
        required: true,
      },
      customerName: String,
      customerPhone: String,
      roomNumber: String,
      date: { type: Date, default: Date.now },
      bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking' },
      userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
      staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
      amount: Number,
      additionalCharges: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      totalAmount: Number,
      // Thêm các trường cho check-in/check-out
      checkInTime: Date,
      checkOutTime: Date,
      guestInfo: {
        name: String,
        idNumber: String,
        phone: String,
        email: String,
        address: String,
        guestSource: { 
          type: String, 
          enum: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other'],
          default: 'walkin'
        }
      },
      paymentMethod: { type: String, enum: ['cash', 'card', 'transfer'], default: 'cash' },
      paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded', 'cancelled'], default: 'paid' },
      rateType: { type: String, enum: ['hourly', 'daily', 'nightly', 'weekly', 'monthly'], default: 'hourly' },
      advancePayment: { type: Number, default: 0 },
      roomTotal: { type: Number, default: 0 },
      servicesTotal: { type: Number, default: 0 },
      services: [{
        serviceId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Service' },
        serviceName: String,
        price: Number,
        quantity: { type: Number, default: 1 },
        totalPrice: Number
      }],
      invoiceNumber: String,
      invoiceId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Invoice' }, // Thêm invoiceId để liên kết với Invoice model
      serviceDetails: {
        serviceOrderId: { type: mongoose.SchemaTypes.ObjectId, ref: 'ServiceOrder' },
        amount: Number
      },
      notes: String,
      targetRoomId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' },
      targetRoomNumber: String
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: Object
});

roomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Room = mongoose.model('Room', roomSchema);
module.exports = { Room };
