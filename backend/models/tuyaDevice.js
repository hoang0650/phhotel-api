const mongoose = require('mongoose');

const tuyaDeviceSchema = new mongoose.Schema({
    // Device ID từ Tuya Cloud
    deviceId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    // Tên thiết bị
    name: {
        type: String,
        required: true,
        trim: true
    },
    
    // Liên kết với khách sạn
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true
    },
    
    // Liên kết với phòng
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room'
    },
    roomNumber: {
        type: String
    },
    
    // Thông tin bổ sung
    deviceType: {
        type: String,
        default: 'switch' // switch, light, etc.
    },
    
    // Metadata
    metadata: {
        type: Object,
        default: {}
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update updatedAt trước khi save
tuyaDeviceSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const TuyaDevice = mongoose.model('TuyaDevice', tuyaDeviceSchema);

module.exports = { TuyaDevice };

