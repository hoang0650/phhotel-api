const mongoose = require('mongoose');

const otaIntegrationSchema = new mongoose.Schema({
    hotelId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Hotel', 
        required: true 
    },
    provider: { 
        type: String,
        enum: ['Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia'],
        required: true 
    },
    credentials: {
        // Common credentials
        username: String,
        password: String,
        hotelId: String,
        propertyId: String,
        apiKey: String,
        apiSecret: String,
        accessToken: String,
        refreshToken: String,
        tokenExpiresAt: Date,
        
        // Agoda specific
        agodaPartnerId: String,
        agodaApiKey: String,
        
        // Traveloka specific
        travelokaClientId: String,
        travelokaClientSecret: String,
        
        // Trip.com specific
        tripClientId: String,
        tripClientSecret: String,
        tripPartnerCode: String,
        
        // Expedia specific (Rapid API)
        expediaApiKey: String,
        expediaSecret: String,
        expediaHotelId: String,
        expediaPropertyId: String, // Alternative to expediaHotelId
        useTestEnv: { type: Boolean, default: false }, // Use test.ean.com for testing
        
        // G2J specific
        g2jApiKey: String,
        g2jApiSecret: String,
        g2jHotelId: String
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'error', 'pending'],
        default: 'inactive' 
    },
    lastSync: Date,
    syncFrequency: { 
        type: Number, 
        default: 60,
        required: true 
    },
    settings: {
        type: {
            autoAcceptBookings: { type: Boolean, default: false },
            updateInventory: { type: Boolean, default: true },
            updatePrices: { type: Boolean, default: true },
            updateAvailability: { type: Boolean, default: true },
            currencyCode: { type: String, default: 'USD' },
            languageCode: { type: String, default: 'en' },
            autoSyncInterval: { type: Number, default: 60 },
            notificationEmail: String,
            markupPercentage: { type: Number, default: 0 },
            minimumStay: { type: Number, default: 1 },
            maximumStay: { type: Number, default: 30 }
        },
        required: true,
        default: {}
    },
    mappings: {
        roomTypes: [
            {
                localRoomTypeId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room', required: true },
                otaRoomTypeId: String,
                otaRoomTypeName: String,
                maxOccupancy: { type: Number, required: true },
                baseRate: { type: Number, required: true },
                extraBedRate: Number,
                mealPlan: String,
                amenities: [String],
                photos: [String],
                description: String
            }
        ],
        ratePlans: [
            {
                localRatePlanId: { type: mongoose.SchemaTypes.ObjectId, required: true },
                otaRatePlanId: String,
                otaRatePlanName: String,
                mealPlan: String,
                cancellationPolicy: {
                    type: { type: String, enum: ['free', 'percentage', 'fixed'], required: true },
                    deadlineDays: { type: Number, required: true },
                    penaltyAmount: { type: Number, required: true },
                    penaltyPercentage: Number,
                    description: String
                },
                restrictions: {
                    minStay: Number,
                    maxStay: Number,
                    closedToArrival: Boolean,
                    closedToDeparture: Boolean
                }
            }
        ]
    },
    propertyInfo: {
        name: String,
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String,
            coordinates: {
                latitude: Number,
                longitude: Number
            }
        },
        starRating: Number,
        facilities: [String],
        policies: {
            checkInTime: String,
            checkOutTime: String,
            cancellationPolicy: String,
            childrenPolicy: String,
            petPolicy: String,
            paymentPolicy: String
        },
        description: String,
        photos: [String],
        amenities: [String],
        contactInfo: {
            phone: String,
            email: String,
            website: String
        }
    },
    errorLog: [
        {
            timestamp: { type: Date, default: Date.now },
            message: String,
            code: String,
            details: mongoose.Schema.Types.Mixed,
            provider: { 
                type: String,
                enum: ['Booking.com', 'Agoda', 'Traveloka', 'Trip.com', 'Expedia'],
                required: true 
            },
            severity: { 
                type: String,
                enum: ['low', 'medium', 'high'],
                required: true 
            }
        }
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

// Unique index for hotel and provider combination
otaIntegrationSchema.index({ hotelId: 1, provider: 1 }, { unique: true });

// Update timestamp before saving
otaIntegrationSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Custom validation for settings
otaIntegrationSchema.pre('validate', function(next) {
    if (this.settings) {
        if (this.settings.markupPercentage < 0) {
            this.invalidate('settings.markupPercentage', 'Markup percentage cannot be negative');
        }
        if (this.settings.minimumStay < 1) {
            this.invalidate('settings.minimumStay', 'Minimum stay must be at least 1 night');
        }
        if (this.settings.maximumStay < this.settings.minimumStay) {
            this.invalidate('settings.maximumStay', 'Maximum stay must be greater than or equal to minimum stay');
        }
    }
    next();
});

// Custom validation for credentials based on provider
otaIntegrationSchema.pre('validate', function(next) {
    if (this.credentials) {
        let isValid = false;
        switch (this.provider) {
            case 'Booking.com':
                isValid = !!(this.credentials.username && this.credentials.password);
                break;
            case 'Agoda':
                isValid = !!(this.credentials.agodaPartnerId && this.credentials.agodaApiKey);
                break;
            case 'Traveloka':
                isValid = !!(this.credentials.travelokaClientId && this.credentials.travelokaClientSecret);
                break;
            case 'Trip.com':
                isValid = !!(this.credentials.tripClientId && this.credentials.tripClientSecret);
                break;
            case 'Expedia':
                isValid = !!(this.credentials.expediaApiKey && this.credentials.expediaSecret);
                break;
            case 'G2J':
                isValid = !!(this.credentials.g2jApiKey && this.credentials.g2jApiSecret);
                break;
        }
        if (!isValid) {
            this.invalidate('credentials', `Missing required credentials for provider ${this.provider}`);
        }
    }
    next();
});

const OtaIntegration = mongoose.model('OtaIntegration', otaIntegrationSchema);
module.exports = { OtaIntegration }; 