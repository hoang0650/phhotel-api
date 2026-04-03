const { sendEmail: sendEmailAdapter } = require('../config/emailServiceAdapter');
const { Settings } = require('../models/settings');
const EmailLog = require('../models/emailLog');

/**
 * Gửi email
 */
async function sendEmail(req, res) {
    try {
        const { to, subject, body, html, file } = req.body;
        
        if (!to || !subject || !body) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin: to, subject, body là bắt buộc'
            });
        }

        // Lấy email settings từ database
        const settings = await Settings.findOne();
        if (!settings || !settings.emailSettings || !settings.emailSettings.emailEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Email service chưa được bật hoặc chưa được cấu hình'
            });
        }

        const emailSettings = settings.emailSettings;
        const fromEmail = emailSettings.emailFrom || emailSettings.emailFromName 
            ? `${emailSettings.emailFromName} <${emailSettings.emailFrom}>`
            : emailSettings.emailFrom;

        // Gửi email qua adapter với emailSettings từ database
        let result;
        let emailLog;
        
        try {
            result = await sendEmailAdapter(
                to,
                subject,
                html || body,
                body,
                fromEmail,
                emailSettings // Truyền emailSettings vào adapter
            );

            // Lưu vào EmailLog
            emailLog = new EmailLog({
                to: to,
                from: emailSettings.emailFrom,
                fromName: emailSettings.emailFromName || '',
                subject: subject,
                body: body,
                html: html || body,
                emailType: 'other',
                provider: emailSettings.emailProvider || 'nodemailer',
                messageId: result.messageId || null,
                status: 'sent',
                sentBy: req.user?._id || null,
                sentAt: new Date()
            });
            await emailLog.save();

            res.status(200).json({
                success: true,
                message: 'Email đã được gửi thành công',
                data: {
                    messageId: result.messageId,
                    provider: result.provider,
                    emailLogId: emailLog._id
                }
            });
        } catch (sendError) {
            // Lưu lỗi vào EmailLog
            emailLog = new EmailLog({
                to: to,
                from: emailSettings.emailFrom,
                fromName: emailSettings.emailFromName || '',
                subject: subject,
                body: body,
                html: html || body,
                emailType: 'other',
                provider: emailSettings.emailProvider || 'nodemailer',
                status: 'failed',
                error: sendError.message,
                sentBy: req.user?._id || null,
                sentAt: new Date()
            });
            await emailLog.save();

            throw sendError;
        }
    } catch (error) {
        console.error('Error sending email:', error);
        
        // Xử lý lỗi Resend domain verification
        let errorMessage = error.message || 'Lỗi không xác định';
        if (error.message && error.message.includes('verify a domain')) {
            errorMessage = error.message; // Giữ nguyên message đã được format trong adapter
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
}

/**
 * Gửi OTP đến email
 */
async function sendOtp(req, res) {
    try {
        const { to } = req.body;
        
        if (!to || !to.includes('@')) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ'
            });
        }

        // Tạo OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Lấy email settings từ database
        const settings = await Settings.findOne();
        if (!settings || !settings.emailSettings || !settings.emailSettings.emailEnabled) {
            return res.status(400).json({
                success: false,
                message: 'Email service chưa được bật hoặc chưa được cấu hình'
            });
        }

        const emailSettings = settings.emailSettings;
        const fromEmail = emailSettings.emailFrom || emailSettings.emailFromName 
            ? `${emailSettings.emailFromName} <${emailSettings.emailFrom}>`
            : emailSettings.emailFrom;

        // Tạo nội dung email
        const subject = 'Mã OTP của bạn';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Mã OTP của bạn</h2>
                <p>Xin chào,</p>
                <p>Mã OTP của bạn là:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
                    <h1 style="color: #007bff; font-size: 32px; margin: 0;">${otp}</h1>
                </div>
                <p>Mã này có hiệu lực trong 10 phút.</p>
                <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
                <p>Trân trọng,<br>${emailSettings.emailFromName || 'Hệ thống'}</p>
            </div>
        `;
        const text = `Mã OTP của bạn là: ${otp}. Mã này có hiệu lực trong 10 phút.`;

        // Gửi email qua adapter với emailSettings từ database
        let result;
        let emailLog;
        
        try {
            result = await sendEmailAdapter(
                to,
                subject,
                html,
                text,
                fromEmail,
                emailSettings // Truyền emailSettings vào adapter
            );

            // Lưu vào EmailLog
            emailLog = new EmailLog({
                to: to,
                from: emailSettings.emailFrom,
                fromName: emailSettings.emailFromName || '',
                subject: subject,
                body: text,
                html: html,
                emailType: 'otp',
                otp: otp,
                provider: emailSettings.emailProvider || 'nodemailer',
                messageId: result.messageId || null,
                status: 'sent',
                sentBy: req.user?._id || null,
                sentAt: new Date()
            });
            await emailLog.save();

            res.status(200).json({
                success: true,
                message: 'OTP đã được gửi đến email của bạn',
                data: {
                    otp: otp, // Trong production, không nên trả về OTP
                    messageId: result.messageId,
                    provider: result.provider,
                    emailLogId: emailLog._id
                }
            });
        } catch (sendError) {
            // Lưu lỗi vào EmailLog
            emailLog = new EmailLog({
                to: to,
                from: emailSettings.emailFrom,
                fromName: emailSettings.emailFromName || '',
                subject: subject,
                body: text,
                html: html,
                emailType: 'otp',
                otp: otp,
                provider: emailSettings.emailProvider || 'nodemailer',
                status: 'failed',
                error: sendError.message,
                sentBy: req.user?._id || null,
                sentAt: new Date()
            });
            await emailLog.save();

            throw sendError;
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        
        // Xử lý lỗi Resend domain verification
        let errorMessage = error.message || 'Lỗi không xác định';
        if (error.message && error.message.includes('verify a domain')) {
            errorMessage = error.message; // Giữ nguyên message đã được format trong adapter
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
}

/**
 * Lấy danh sách Email đã gửi (lịch sử email)
 */
async function loadOtp(req, res) {
    try {
        const { limit = 50, skip = 0, emailType, status } = req.query;
        
        // Xây dựng query
        const query = {};
        if (emailType) {
            query.emailType = emailType;
        }
        if (status) {
            query.status = status;
        }

        // Lấy từ database EmailLog
        const emailLogs = await EmailLog.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .populate('sentBy', 'name email')
            .lean();

        // Format dữ liệu để trả về
        const emailList = emailLogs.map(log => ({
            _id: log._id,
            email: log.to,
            subject: log.subject,
            otp: log.otp || undefined,
            date: log.sentAt || log.createdAt,
            status: log.status,
            provider: log.provider,
            emailType: log.emailType,
            from: log.from,
            fromName: log.fromName,
            sentBy: log.sentBy ? {
                name: log.sentBy.name,
                email: log.sentBy.email
            } : null,
            error: log.error || undefined
        }));

        // Đếm tổng số
        const total = await EmailLog.countDocuments(query);

        res.status(200).json({
            success: true,
            data: emailList,
            total: total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });
    } catch (error) {
        console.error('Error loading email history:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tải danh sách email: ' + error.message
        });
    }
}

module.exports = {
    sendEmail,
    sendOtp,
    loadOtp
}