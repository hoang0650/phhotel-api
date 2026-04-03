const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
  roomId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room', required: true },
  guestId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
  staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  actualCheckInDate: Date,
  actualCheckOutDate: Date,
  status: { 
    type: String, 
    enum: ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
    default: 'confirmed',
    required: true
  },
  bookingType: { 
    type: String, 
    enum: ['hourly', 'daily', 'nightly'],
    default: 'daily',
    required: true
  },
  adults: { type: Number, default: 1 },
  children: { type: Number, default: 0 },
  basePrice: { type: Number, required: true },
  additionalCharges: [
    {
      description: String,
      amount: Number,
      date: { type: Date, default: Date.now }
    }
  ],
  discounts: [
    {
      description: String,
      amount: Number,
      date: { type: Date, default: Date.now }
    }
  ],
  deposit: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  paymentStatus: { 
    type: String, 
    enum: ['pending', 'partial', 'paid', 'refunded'],
    default: 'pending',
    required: true 
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash', 'credit_card', 'bank_transfer'],
    default: 'cash' 
  },
  paymentDetails: {
    transactionId: String,
    cardLast4: String,
    bankReference: String,
    paymentDate: Date,
    paymentHistory: [{
      amount: Number,
      date: { type: Date, default: Date.now },
      method: String,
      staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
      transactionId: String
    }]
  },
  services: [
    {
      serviceId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Service' },
      name: String,
      quantity: Number,
      unitPrice: Number,
      totalPrice: Number,
      date: Date
    }
  ],
  source: { 
    type: String, 
    enum: ['direct', 'ota', 'phone', 'walk_in'],
    default: 'direct' 
  },
  otaSource: String,
  otaBookingId: String,
  guestDetails: {
    name: String,
    email: String,
    phone: String,
    idType: String,
    idNumber: String
  },
  notes: String,
  createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
  logs: [{
    action: String,
    timestamp: { type: Date, default: Date.now },
    userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
    details: String
  }],
  // Thông tin chuyển phòng
  transferredFrom: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' }, // Phòng nguồn (phòng ban đầu)
  transferredTo: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' }, // Phòng đích hiện tại (nếu đã chuyển)
  transferredAt: Date, // Thời gian chuyển phòng
  transferredBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' }, // Nhân viên thực hiện chuyển phòng
  transferHistory: [{ // Lịch sử chuyển phòng (nếu có nhiều lần chuyển)
    fromRoomId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' },
    toRoomId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room' },
    fromRoomNumber: String,
    toRoomNumber: String,
    transferredAt: { type: Date, default: Date.now },
    transferredBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
    notes: String,
    oldBasePrice: Number,
    newBasePrice: Number
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: Object
});

bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = { Booking }
