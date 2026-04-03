const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SettingsSchema = new Schema({
    // System Settings
    systemSettings: {
        systemName: { type: String, default: 'Hệ thống quản lý khách sạn' },
        systemVersion: { type: String, default: '1.0.0' },
        timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
        language: { type: String, default: 'vi' },
        currency: { type: String, default: 'VND' },
        dateFormat: { type: String, default: 'DD/MM/YYYY' },
        timeFormat: { type: String, default: '24h' },
        autoBackup: { type: Boolean, default: true },
        backupFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
        maxBackupFiles: { type: Number, default: 30, min: 1, max: 365 },
        sessionTimeout: { type: Number, default: 30, min: 5, max: 480 },
        enableLogging: { type: Boolean, default: true },
        logLevel: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info' }
    },
    
    // Email Settings
    emailSettings: {
        emailEnabled: { type: Boolean, default: true },
        emailProvider: { 
            type: String, 
            enum: ['resend', 'sendgrid', 'mailgun', 'aws-ses', 'nodemailer'], 
            default: 'nodemailer' 
        },
        // Nodemailer/SMTP settings
        smtpHost: { type: String, default: 'smtp.gmail.com' },
        smtpPort: { type: Number, default: 587, min: 1, max: 65535 },
        smtpSecure: { type: Boolean, default: false },
        smtpUser: { type: String, default: '' },
        smtpPassword: { type: String, default: '' },
        // Resend settings
        resendApiKey: { type: String, default: '' },
        // Resend templates
        resendTemplateResetId: { type: String, default: '' },
        resendTemplateResetAlias: { type: String, default: '' },
        resendTemplateSubscriptionId: { type: String, default: '' },
        resendTemplateSubscriptionAlias: { type: String, default: '' },
        // SendGrid settings
        sendgridApiKey: { type: String, default: '' },
        // Mailgun settings
        mailgunApiKey: { type: String, default: '' },
        mailgunDomain: { type: String, default: '' },
        // AWS SES settings
        awsAccessKeyId: { type: String, default: '' },
        awsSecretAccessKey: { type: String, default: '' },
        awsRegion: { type: String, default: 'us-east-1' },
        // Common settings
        emailFrom: { type: String, default: '' },
        emailFromName: { type: String, default: 'Hệ thống quản lý khách sạn' },
        emailReplyTo: { type: String, default: '' },
        emailTestAddress: { type: String, default: '' }
    },
    
    // Payment Settings
    paymentSettings: {
        defaultPaymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'card', 'qr'], default: 'cash' },
        enableCash: { type: Boolean, default: true },
        enableBankTransfer: { type: Boolean, default: true },
        enableCard: { type: Boolean, default: true },
        enableQR: { type: Boolean, default: true },
        enableCrypto: { type: Boolean, default: false },
        enablePayPal: { type: Boolean, default: false },
        autoReconcile: { type: Boolean, default: false },
        reconcileFrequency: { type: String, enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
        minimumBalanceAlert: { type: Number, default: 0, min: 0 },
        paymentTimeout: { type: Number, default: 300, min: 30, max: 3600 },
        // Bank Account for QR Payment
        bankAccount: {
            bankName: { type: String, default: '' },
            accountNumber: { type: String, default: '' },
            accountHolderName: { type: String, default: '' },
            beneficiaryName: { type: String, default: '' }, // Tên người thụ hưởng (hiển thị trên QR code)
            branch: { type: String, default: '' },
            swiftCode: { type: String, default: '' },
            iban: { type: String, default: '' },
            qrPaymentUrl: { type: String, default: '' } // Link QR thanh toán SePay
        }
    },
    
    // Notification Settings
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
    },
    
    // General Settings
    generalSettings: {
        companyName: { type: String, default: '' },
        companyAddress: { type: String, default: '' },
        companyPhone: { type: String, default: '' },
        companyEmail: { type: String, default: '' },
        companyWebsite: { type: String, default: '' },
        taxId: { type: String, default: '' },
        businessLicense: { type: String, default: '' },
        logo: { type: String, default: '' },
        favicon: { type: String, default: '' },
        maintenanceMode: { type: Boolean, default: false },
        maintenanceMessage: { type: String, default: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.' },
        allowRegistration: { type: Boolean, default: true },
        requireEmailVerification: { type: Boolean, default: false },
        enable2FA: { type: Boolean, default: false }
    },
    
    // System Announcements
    announcements: [{
        id: { type: String, required: true },
        type: { 
            type: String, 
            enum: ['maintenance', 'update', 'info', 'warning', 'success'],
            default: 'info'
        },
        title: { type: String, required: true },
        message: { type: String, required: true },
        priority: { 
            type: String, 
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium'
        },
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date },
        isActive: { type: Boolean, default: true },
        targetRoles: [{ type: String }], // Nếu rỗng thì hiển thị cho tất cả roles
        targetBusinesses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Business' }], // Nếu rỗng thì hiển thị cho tất cả businesses
        targetHotels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' }], // Nếu rỗng thì hiển thị cho tất cả hotels
        targetType: { 
            type: String, 
            enum: ['system', 'business', 'hotel'], 
            default: 'system' 
        }, // Loại target: system (tất cả), business (theo doanh nghiệp), hotel (theo khách sạn)
        notificationType: { 
            type: String, 
            enum: ['booking', 'checkin', 'checkout', 'payment', 'cancellation', 'lowInventory', 'systemError', 'general', 'registration', 'contact'],
            default: 'general'
        }, // Loại thông báo để map với notifyOn* settings (general = hiển thị luôn, không phụ thuộc vào notifyOn*)
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User ID của người dùng liên quan (cho thông báo gói, đăng ký, liên hệ)
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    
    // Metadata
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index để đảm bảo chỉ có 1 document settings
SettingsSchema.index({}, { unique: true });

const Settings = mongoose.model('Settings', SettingsSchema);

module.exports = { Settings };

