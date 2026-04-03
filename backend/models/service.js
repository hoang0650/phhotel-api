const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema cho dịch vụ
const serviceSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['room_service', 'food', 'beverage', 'spa', 'transport', 'custom'],
    default: 'custom',
    trim: true
  },
  hotelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hotel',
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  currency: {
    type: String,
    default: 'VND'
  },
  // Quản lý kho
  costPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  importQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  salesQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  inventory: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Pre-save middleware để cập nhật updatedAt và tính tồn kho
serviceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Tự động tính tồn kho = số lượng nhập - số lượng bán
  if (this.importQuantity !== undefined && this.salesQuantity !== undefined) {
    this.inventory = Math.max(0, (this.importQuantity || 0) - (this.salesQuantity || 0));
  }
  next();
});

const Service = mongoose.model('Service', serviceSchema);

module.exports = { Service };
