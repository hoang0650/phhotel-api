const mongoose = require('mongoose');

const guestSchema = new mongoose.Schema({
    userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
    businessId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Business' },
    guestType: {
        type: String,
        enum: ['regular', 'frequent', 'group'], // regular: khách lưu, frequent: khách quen, group: khách đoàn
        default: 'regular'
    },
    isGroupLeader: { type: Boolean, default: false }, // Người đại diện đoàn
    groupId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Guest' }, // ID của đoàn (nếu là thành viên)
    groupMembers: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Guest' }], // Danh sách thành viên (nếu là leader)
    groupSize: { type: Number, default: 1 }, // Số lượng người trong đoàn
    personalInfo: {
        firstName: String,
        lastName: String,
        fullName: String, // Tên đầy đủ (firstName + lastName)
        dateOfBirth: Date,
        gender: String,
        nationality: String,
        idType: { 
            type: String, 
            enum: ['passport', 'id_card', 'driver_license']
        },
        idNumber: String,
        idExpiryDate: Date,
        idScanUrl: String
    },
    contactInfo: {
        email: String,
        phone: String,
        alternativePhone: String,
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String
        }
    },
    preferences: {
        roomType: String,
        floor: String,
        specialRequests: [String],
        dietaryRestrictions: [String]
    },
    stayHistory: [
        {
            bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking' },
            checkInDate: Date,
            checkOutDate: Date,
            roomNumber: String,
            totalSpent: Number,
            rating: Number,
            feedback: String
        }
    ],
    loyaltyPoints: { type: Number, default: 0 },
    loyaltyTier: { 
        type: String, 
        enum: ['standard', 'silver', 'gold', 'platinum'],
        default: 'standard'
    },
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

guestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Tự động tạo fullName từ firstName và lastName nếu chưa có
    if (!this.personalInfo?.fullName) {
        if (this.personalInfo?.firstName || this.personalInfo?.lastName) {
            const firstName = this.personalInfo.firstName || '';
            const lastName = this.personalInfo.lastName || '';
            this.personalInfo.fullName = `${firstName} ${lastName}`.trim();
        }
    }
    
    // Nếu có fullName nhưng không có firstName/lastName, tách ra
    if (this.personalInfo?.fullName && (!this.personalInfo.firstName || !this.personalInfo.lastName)) {
        const nameParts = this.personalInfo.fullName.split(/\s+/);
        if (nameParts.length >= 2) {
            this.personalInfo.lastName = nameParts[0];
            this.personalInfo.firstName = nameParts.slice(1).join(' ');
        } else if (nameParts.length === 1) {
            this.personalInfo.lastName = nameParts[0];
        }
    }
    
    next();
});

const Guest = mongoose.model('Guest', guestSchema);
module.exports = { Guest }; 