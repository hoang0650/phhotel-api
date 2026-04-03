const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    businessId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'Business', 
        required: true,
        unique: true
    },
    plan: { 
        type: String, 
        enum: ['starter', 'professional', 'vip'],
        required: true 
    },
    billingCycle: { 
        type: String, 
        enum: ['monthly', 'yearly'],
        default: 'monthly' 
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    discount: {
        percentage: { type: Number, default: 0 },
        reason: { 
            type: String, 
            enum: ['multi_year', 'promotion', 'loyalty']
        },
        code: String
    },
    status: { 
        type: String, 
        enum: ['active', 'pending', 'expired', 'cancelled'],
        default: 'pending' 
    },
    autoRenew: { type: Boolean, default: true },
    paymentMethod: {
        type: { 
            type: String, 
            enum: ['credit_card', 'bank_transfer', 'paypal'] 
        },
        details: {
            cardLast4: String,
            cardType: String,
            expiryDate: String,
            bankName: String,
            accountNumber: String
        }
    },
    invoices: [
        {
            invoiceId: String,
            date: Date,
            amount: Number,
            status: { 
                type: String, 
                enum: ['paid', 'pending', 'overdue'] 
            },
            paidDate: Date,
            pdfUrl: String
        }
    ],
    features: {
        maxHotels: { type: Number, default: 1 },
        maxRoomsPerHotel: { type: Number, default: 10 },
        maxStaffPerHotel: { type: Number, default: 5 },
        otaIntegration: { type: Boolean, default: false },
        bankIntegration: { type: Boolean, default: false },
        staffManagement: { type: Boolean, default: true },
        ai: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

subscriptionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);
module.exports = { Subscription }; 