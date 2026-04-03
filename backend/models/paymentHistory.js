const mongoose = require('mongoose');

const paymentHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'User',
        required: true
    },
    packageId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'PricingPackage',
        required: false // Không bắt buộc (có thể là checkout phòng)
    },
    roomId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'Room',
        required: false // Cho checkout phòng
    },
    paymentMethod: {
        type: String,
        enum: ['paypal', 'sepay', 'crypto_usdt', 'bank_transfer'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'VND'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
        default: 'pending'
    },
    transactionId: String, // ID từ payment gateway
    paymentGatewayResponse: Object, // Full response từ payment gateway
    billingType: {
        type: String,
        enum: ['monthly', 'yearly'],
        required: false // Không bắt buộc (có thể là checkout phòng)
    },
    // Crypto USDT specific fields
    cryptoAddress: String, // USDT wallet address
    cryptoNetwork: String, // TRC20, ERC20, BEP20
    cryptoAmount: Number, // Amount in USDT
    cryptoTransactionHash: String, // Blockchain transaction hash
    // PayPal specific fields
    paypalOrderId: String,
    paypalPayerId: String,
    // SePay specific fields
    sepayOrderId: String,
    sepayInvoiceNumber: String,
    metadata: Object,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
});

paymentHistorySchema.index({ userId: 1, createdAt: -1 });
paymentHistorySchema.index({ transactionId: 1 });
paymentHistorySchema.index({ status: 1 });

paymentHistorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    if (this.status === 'completed' && !this.completedAt) {
        this.completedAt = Date.now();
    }
    next();
});

const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);
module.exports = { PaymentHistory };

