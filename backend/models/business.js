const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const businessSchema = new Schema({
    name: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    taxId: { type: String, required: true, trim: true },
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        postalCode: String
    },
    contactInfo: {
        email: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        website: String
    },
    logo: String, // URL logo (backward compatible)
    logoId: { type: Schema.Types.ObjectId, ref: 'Image' }, // ID ảnh từ fileModel
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscription: {
        plan: { type: String, enum: ['starter', 'professional', 'vip'], default: 'starter' },
        startDate: Date,
        endDate: Date,
        paymentStatus: { type: String, enum: ['active', 'pending', 'expired'], default: 'pending' },
        autoRenew: { type: Boolean, default: true },
        discount: { type: Number, default: 0 },
        contractYears: { type: Number, default: 1 }
    },
    limits: {
        maxHotels: { type: Number, default: 1 },
        maxRoomsPerHotel: { type: Number, default: 10 },
        maxStaffPerHotel: { type: Number, default: 5 },
        features: {
            otaIntegration: { type: Boolean, default: false },
            bankIntegration: { type: Boolean, default: false },
            staffManagement: { type: Boolean, default: true },
            ai: { type: Boolean, default: false }
        }
    },
    hotels: [{ type: Schema.Types.ObjectId, ref: 'Hotel' }],
    status: { 
        type: String, 
        enum: ['pending', 'active', 'inactive', 'suspended'], 
        default: 'pending'
    },
    settings: {
        defaultCurrency: { type: String, default: 'USD' },
        defaultLanguage: { type: String, default: 'en' },
        defaultCheckInTime: { type: String, default: '14:00' },
        defaultCheckOutTime: { type: String, default: '12:00' },
        taxRate: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

businessSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Business = mongoose.model('Business', businessSchema);
module.exports = { Business };