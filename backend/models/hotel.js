const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    businessId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Business', required: true },
    taxId: { type: String },
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
    contactInfo: {
        email: String,
        phone: String,
        website: String
    },
    images: [String],
    logo: String, // URL của logo
    logoId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Image' }, // ID của ảnh trong FileModel
    managerId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    facilities: [String],
    description: String,
    starRating: Number,
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },
    rooms: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Room' }],
    staff: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' }],
    settings: {
        checkInTime: { type: String, default: '14:00' },
        checkOutTime: { type: String, default: '12:00' },
        currency: { type: String, default: 'USD' },
        language: { type: String, default: 'en' },
        taxRate: { type: Number, default: 0 },
        // Cài đặt thanh toán QR cho chuyển khoản
        enableQRPaymentForBankTransfer: { type: Boolean, default: false }, // Bật QR thanh toán khi chuyển khoản trong room
        // Cài đặt tính năng quản lý OTA
        enableOTAManagement: { type: Boolean, default: false }, // Bật quản lý OTA cho khách sạn
        // Cài đặt tính năng quản lý email
        enableEmailManagement: { type: Boolean, default: false }, // Bật quản lý email cho khách sạn
        // Cài đặt tính năng quản lý điện
        enableElectricManagement: { type: Boolean, default: false }, // Bật quản lý điện cho khách sạn
        // Cài đặt thanh toán PayPal
        enablePayPalPayment: { type: Boolean, default: false }, // Bật thanh toán PayPal cho khách sạn
        // Cài đặt thanh toán Crypto
        enableCryptoPayment: { type: Boolean, default: false }, // Bật thanh toán Crypto cho khách sạn
        // Cài đặt xem hóa đơn nháp
        enableDraftInvoice: { type: Boolean, default: false }, // Bật xem hóa đơn nháp cho khách sạn
        // Cài đặt xuất hóa đơn
        enableExportInvoice: { type: Boolean, default: false }, // Bật xuất hóa đơn cho khách sạn
        // Cài đặt AI Chatbox
        enableAiChatbox: { type: Boolean, default: false }, // Bật AI Chatbox cho khách sạn
        // Cài đặt thông báo cho khách sạn
        notificationSettings: {
            enableEmailNotifications: { type: Boolean, default: true },
            enableSMSNotifications: { type: Boolean, default: false },
            enablePushNotifications: { type: Boolean, default: true },
            notifyOnBooking: { type: Boolean, default: true },
            notifyOnCheckin: { type: Boolean, default: true },
            notifyOnCheckout: { type: Boolean, default: true },
            notifyOnPayment: { type: Boolean, default: true },
            notifyOnCancellation: { type: Boolean, default: true },
            notifyOnLowInventory: { type: Boolean, default: true },
            notifyOnSystemError: { type: Boolean, default: true },
            notificationEmail: { type: String, default: '' }
        }
    },
    revenue: {
        total: { type: Number, default: 0 },
        daily: { type: Number, default: 0 },
        monthly: { type: Number, default: 0 },
        yearly: { type: Number, default: 0 },
        history: [{
            date: { type: Date },
            amount: { type: Number, default: 0 },
            source: { type: String, enum: ['room', 'service', 'other'] }
        }]
    },
    occupancyRate: { type: Number, default: 0 },
    // Vốn đầu tư ban đầu (để tính thời gian hoàn vốn)
    initialInvestment: { type: Number, default: 0 },
    // Cấu hình tài chính
    financialConfig: {
        depreciationRate: { type: Number, default: 10 }, // % khấu hao mỗi năm
        loanPercentage: { type: Number, default: 70 }, // % vốn vay
        interestRate: { type: Number, default: 8 }, // % lãi suất vay/năm
        taxRate: { type: Number, default: 20 }, // % thuế suất
        wacc: { type: Number, default: 9 }, // % WACC
        projectionYears: { type: Number, default: 10 } // Số năm projection cho NPV/IRR
    },
    // Thông tin ngân hàng cho thanh toán chuyển khoản
    bankAccount: {
        bankName: String,
        accountNumber: String,
        accountHolderName: String,
        beneficiaryName: String, // Tên người thụ hưởng (hiển thị trên QR code)
        branch: String, // Chi nhánh ngân hàng
        qrPaymentUrl: String // Link QR thanh toán SePay
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

hotelSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Hotel = mongoose.model('Hotel', hotelSchema);

module.exports = { Hotel }
