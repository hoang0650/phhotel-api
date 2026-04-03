const mongoose = require('mongoose');

const bankIntegrationSchema = new mongoose.Schema({
    hotelId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Hotel', 
        required: true 
    },
    bankName: { type: String, required: true },
    accountType: { 
        type: String, 
        enum: ['checking', 'savings', 'business'],
        default: 'business' 
    },
    accountNumber: String,
    accountName: String,
    credentials: {
        // OAuth2 credentials (SePay OAuth2)
        clientId: String, // OAuth2 client_id
        clientSecret: String, // OAuth2 client_secret
        accessToken: String, // OAuth2 access_token
        refreshToken: String, // OAuth2 refresh_token
        tokenExpiry: Date, // Thời gian hết hạn access_token
        scopes: [String], // Các phạm vi được cấp: ['bank-account:read', 'transaction:read', etc.]
        
        // Legacy credentials (giữ lại để tương thích)
        username: String,
        password: String,
        apiKey: String,
        apiSecret: String
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'error'],
        default: 'inactive' 
    },
    lastSync: Date,
    syncFrequency: { type: Number, default: 60 }, // in minutes
    settings: {
        autoReconcile: { type: Boolean, default: false },
        notifyOnTransaction: { type: Boolean, default: true },
        minimumBalanceAlert: Number
    },
    transactionHistory: [
        {
            transactionId: String,
            date: Date,
            description: String,
            amount: Number,
            type: { 
                type: String, 
                enum: ['credit', 'debit']
            },
            balance: Number,
            bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking' },
            reconciled: { type: Boolean, default: false }
        }
    ],
    errorLog: [
        {
            timestamp: { type: Date, default: Date.now },
            message: String,
            code: String,
            details: Object
        }
    ],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

bankIntegrationSchema.index({ hotelId: 1, bankName: 1 }, { unique: true });

bankIntegrationSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const BankIntegration = mongoose.model('BankIntegration', bankIntegrationSchema);
module.exports = { BankIntegration }; 