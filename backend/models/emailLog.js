const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
    // Thông tin người nhận
    to: {
        type: String,
        required: true,
        index: true
    },
    // Thông tin người gửi
    from: {
        type: String,
        required: true
    },
    fromName: {
        type: String,
        default: ''
    },
    // Chủ đề email
    subject: {
        type: String,
        required: true
    },
    // Nội dung email
    body: {
        type: String,
        default: ''
    },
    html: {
        type: String,
        default: ''
    },
    // Loại email
    emailType: {
        type: String,
        enum: ['otp', 'notification', 'test', 'forgot_password', 'booking', 'invoice', 'other'],
        default: 'other'
    },
    // OTP (nếu là email OTP)
    otp: {
        type: String,
        default: null
    },
    // Provider sử dụng
    provider: {
        type: String,
        enum: ['resend', 'sendgrid', 'mailgun', 'aws-ses', 'nodemailer'],
        default: 'nodemailer'
    },
    // Message ID từ provider
    messageId: {
        type: String,
        default: null
    },
    // Trạng thái
    status: {
        type: String,
        enum: ['sent', 'failed', 'pending'],
        default: 'pending'
    },
    // Lỗi (nếu có)
    error: {
        type: String,
        default: null
    },
    // User gửi (nếu có)
    sentBy: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'User',
        default: null
    },
    // File đính kèm (nếu có)
    attachments: [{
        filename: String,
        size: Number
    }],
    // Metadata
    metadata: {
        type: Object,
        default: {}
    },
    // Timestamps
    sentAt: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes
emailLogSchema.index({ to: 1, createdAt: -1 });
emailLogSchema.index({ emailType: 1, createdAt: -1 });
emailLogSchema.index({ status: 1, createdAt: -1 });
emailLogSchema.index({ sentBy: 1, createdAt: -1 });
emailLogSchema.index({ provider: 1, createdAt: -1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;

