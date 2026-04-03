const mongoose = require('mongoose');

const otaBookingSchema = new mongoose.Schema({
    // Thông tin từ OTA
    otaProvider: { 
        type: String,
        enum: ['Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia', 'G2J'],
        required: true 
    },
    otaBookingId: { 
        type: String, 
        required: true,
        index: true
    },
    otaConfirmationNumber: String,
    
    // Liên kết với hệ thống
    hotelId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Hotel', 
        required: true 
    },
    localBookingId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Booking' 
    },
    localRoomId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Room' 
    },
    integrationId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'OtaIntegration' 
    },

    // Thông tin khách hàng
    guestDetails: {
        name: { type: String, required: true },
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        nationality: String,
        idType: String,
        idNumber: String,
        address: {
            street: String,
            city: String,
            country: String,
            postalCode: String
        },
        specialRequests: String,
        numberOfGuests: {
            adults: { type: Number, default: 1 },
            children: { type: Number, default: 0 },
            infants: { type: Number, default: 0 }
        }
    },

    // Thông tin đặt phòng
    roomDetails: {
        roomTypeId: String,
        roomTypeName: { type: String, required: true },
        roomCount: { type: Number, default: 1 },
        bedType: String,
        mealPlan: String,
        amenities: [String],
        maxOccupancy: Number
    },

    // Thời gian
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    checkInTime: String,
    checkOutTime: String,
    numberOfNights: Number,
    
    // Giá và thanh toán
    pricing: {
        totalAmount: { type: Number, required: true },
        currency: { type: String, default: 'VND' },
        basePrice: Number,
        taxes: Number,
        fees: Number,
        discount: Number,
        commission: Number,
        netAmount: Number,
        pricePerNight: Number,
        extraCharges: [{
            description: String,
            amount: Number
        }]
    },

    // Hình thức thanh toán
    paymentMethod: { 
        type: String, 
        enum: ['pay_at_property', 'prepaid', 'credit_card', 'bank_transfer', 'virtual_card', 'other'],
        default: 'pay_at_property'
    },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'partial', 'paid', 'refunded', 'cancelled'],
        default: 'pending'
    },
    paymentDetails: {
        cardType: String,
        cardLast4: String,
        expiryDate: String,
        virtualCardNumber: String,
        virtualCardCvv: String,
        virtualCardExpiry: String,
        paidAmount: { type: Number, default: 0 },
        refundedAmount: { type: Number, default: 0 },
        paymentHistory: [{
            amount: Number,
            date: Date,
            method: String,
            transactionId: String,
            note: String
        }]
    },

    // Trạng thái booking
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'modified', 'checked_in', 'checked_out', 'cancelled', 'no_show'],
        default: 'pending',
        required: true
    },
    otaStatus: String,
    cancellationInfo: {
        cancelledAt: Date,
        cancelledBy: String,
        reason: String,
        penalty: Number,
        refundAmount: Number
    },

    // Chính sách
    policies: {
        cancellationPolicy: String,
        cancellationDeadline: Date,
        prepaymentRequired: Boolean,
        noShowPolicy: String,
        remarks: String
    },

    // Đồng bộ
    syncStatus: {
        lastSyncAt: Date,
        lastSyncStatus: { 
            type: String, 
            enum: ['success', 'failed', 'pending'],
            default: 'pending'
        },
        lastSyncError: String,
        syncAttempts: { type: Number, default: 0 }
    },

    // Lịch sử thay đổi
    logs: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
        staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
        details: String,
        previousValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
    }],

    // Ghi chú
    notes: String,
    internalNotes: String,
    
    // Raw data từ OTA (để debug và sync)
    rawData: mongoose.Schema.Types.Mixed,

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

// Index cho tìm kiếm nhanh
otaBookingSchema.index({ hotelId: 1, otaProvider: 1, status: 1 });
otaBookingSchema.index({ hotelId: 1, checkInDate: 1, checkOutDate: 1 });
otaBookingSchema.index({ otaProvider: 1, otaBookingId: 1 }, { unique: true });
otaBookingSchema.index({ 'guestDetails.name': 'text', 'guestDetails.email': 'text' });

// Pre-save middleware
otaBookingSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Tính số đêm
    if (this.checkInDate && this.checkOutDate) {
        const diffTime = Math.abs(this.checkOutDate - this.checkInDate);
        this.numberOfNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    next();
});

// Virtual để lấy thông tin tóm tắt
otaBookingSchema.virtual('summary').get(function() {
    return {
        bookingId: this.otaBookingId,
        guestName: this.guestDetails?.name,
        roomType: this.roomDetails?.roomTypeName,
        checkIn: this.checkInDate,
        checkOut: this.checkOutDate,
        totalAmount: this.pricing?.totalAmount,
        status: this.status,
        provider: this.otaProvider
    };
});

// Đảm bảo virtuals được include khi convert to JSON/Object
otaBookingSchema.set('toJSON', { virtuals: true });
otaBookingSchema.set('toObject', { virtuals: true });

const OtaBooking = mongoose.model('OtaBooking', otaBookingSchema);
module.exports = { OtaBooking };

