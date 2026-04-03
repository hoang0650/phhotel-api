const mongoose = require('mongoose');

const roomCategorySchema = new mongoose.Schema({
  hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
  name: { type: String, required: true }, // e.g. "Phong VIP", "Phong Thuong"
  description: { type: String, default: '' },
  pricing: {
    hourly: { type: Number, default: 0 },
    daily: { type: Number, default: 0 },
    nightly: { type: Number, default: 0 },
    weekly: { type: Number, default: 0 },
    monthly: { type: Number, default: 0 },
    currency: { type: String, default: 'VND' }
  },
  firstHourRate: { type: Number, default: 0 },
  additionalHourRate: { type: Number, default: 0 },
  capacity: {
    adults: { type: Number, default: 2 },
    children: { type: Number, default: 0 }
  },
  amenities: [String],
  priceSettings: {
    nightlyStartTime: { type: String, default: '22:00' },
    nightlyEndTime: { type: String, default: '12:00' },
    dailyStartTime: { type: String, default: '06:00' },
    dailyEndTime: { type: String, default: '22:00' },
    autoNightlyHours: { type: Number, default: 8 },
    autoDailyHours: { type: Number, default: 24 },
    gracePeriodMinutes: { type: Number, default: 15 },
    timezone: { type: String, default: 'UTC+7' },
    dailyEarlyCheckinSurcharge: { type: Number, default: 0 },
    dailyLateCheckoutFee: { type: Number, default: 0 },
    nightlyEarlyCheckinSurcharge: { type: Number, default: 0 },
    nightlyLateCheckoutSurcharge: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

roomCategorySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const RoomCategory = mongoose.model('RoomCategory', roomCategorySchema);
module.exports = { RoomCategory };
