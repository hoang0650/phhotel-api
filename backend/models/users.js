const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    phone: String,
    fullName: String,
    role: { 
        type: String, 
        enum: ['superadmin', 'admin', 'business', 'hotel', 'staff', 'guest'],
        default: 'guest',
        required: true
    },
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'suspended', 'deleted'],
        default: 'active'
    },
    avatar: String, // URL ảnh (backward compatible)
    avatarId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Image' }, // ID ảnh từ fileModel
    lastLogin: Date,
    lastLoginIp: String, // Địa chỉ IP lúc đăng nhập cuối cùng
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    twoFactorEnabled: Boolean,
    twoFactorSecret: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // Xác thực email
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    businessId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Business' },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel' },
    pricingPackage: { type: mongoose.SchemaTypes.ObjectId, ref: 'PricingPackage' },
    packageExpiryDate: Date,
    billingType: {
        type: String,
        enum: ['monthly', 'yearly'],
        default: 'monthly'
    },
    paymentInfo: {
        paymentId: String,
        paymentMethod: String,
        paymentDate: Date
    },
    preferences: {
        language: { type: String, default: 'en' },
        theme: { type: String, default: 'light' },
        biometricEnabled: { type: Boolean, default: false },
        notifications: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        }
    },
    permissions: {
        type: [{
            type: String,
            enum: ['view', 'create', 'edit', 'delete', 'manage_revenue']
        }],
        default: function() {
            switch (this.role) {
                case 'superadmin':
                case 'admin':
                case 'business':
                    return ['view', 'create', 'edit', 'delete', 'manage_revenue'];
                case 'hotel':
                    return ['view', 'create', 'edit', 'manage_revenue'];
                case 'staff':
                    return ['view', 'create'];
                default:
                    return ['view'];
            }
        }
    },
    // Tính năng (features) - tương tự pricing-management
    features: [{
        type: String,
        enum: [
            'room_management',
            'hotel_management',
            'company_management',
            'staff_management',
            'service_management',
            'user_management',
            'pricing_management',
            'ota_management',
            'revenue_chart',
            'shift_handover',
            'bank_transfer_history',
            'calendar',
            'email_admin',
            'qr_payment',
            'visa_payment',
            'electric_management'
        ]
    }],
    // Feature flags - tương tự pricing-management
    qrPaymentFeature: { type: Boolean, default: false },
    otaManagementFeature: { type: Boolean, default: false },
    emailManagementFeature: { type: Boolean, default: false },
    electricManagementFeature: { type: Boolean, default: false },
    paypalPaymentFeature: { type: Boolean, default: false },
    cryptoPaymentFeature: { type: Boolean, default: false },
    draftInvoiceFeature: { type: Boolean, default: false },
    exportInvoiceFeature: { type: Boolean, default: false },
    aiChatboxFeature: { type: Boolean, default: false },
    metadata: Object,
    // Thông tin ngân hàng
    bankAccount: {
        bankName: String,
        accountNumber: String,
        accountHolderName: String,
        beneficiaryName: String, // Tên người thụ hưởng (hiển thị trên QR code)
        branch: String, // Chi nhánh ngân hàng
        swiftCode: String, // SWIFT/BIC code (cho thanh toán quốc tế)
        iban: String, // IBAN (cho thanh toán quốc tế)
        qrPaymentUrl: String // Link QR thanh toán SePay
    },
    // Thông tin cá nhân bổ sung
    personalInfo: {
        dateOfBirth: Date,
        gender: String,
        nationality: String,
        idCard: String, // CMND/CCCD
        idCardIssueDate: Date,
        idCardIssuePlace: String,
        address: {
            street: String,
            ward: String, // Phường/Xã
            district: String, // Quận/Huyện
            city: String, // Tỉnh/Thành phố
            country: String,
            postalCode: String
        }
    },
    // Danh sách announcement IDs đã đọc (theo từng user)
    readAnnouncements: [{ type: String }]
});

UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const User = mongoose.model('User', UserSchema);
module.exports = { User };
