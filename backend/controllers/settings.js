const { Settings } = require('../models/settings');
const { sendForgotPasswordEmail } = require('../config/emailServices');
const { verifyConnection: verifyEmailConnection, sendEmail: sendEmailAdapter } = require('../config/emailServiceAdapter');
const nodemailer = require('nodemailer');

// Lấy tất cả settings
async function getAllSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        
        // Nếu chưa có settings, tạo mới với giá trị mặc định
        if (!settings) {
            settings = new Settings();
            await settings.save();
        }
        
        // Không trả về password/API keys trong email settings
        const settingsData = settings.toObject();
        if (settingsData.emailSettings) {
            if (settingsData.emailSettings.smtpPassword) {
                settingsData.emailSettings.smtpPassword = '***';
            }
            if (settingsData.emailSettings.resendApiKey) {
                settingsData.emailSettings.resendApiKey = '***';
            }
            if (settingsData.emailSettings.sendgridApiKey) {
                settingsData.emailSettings.sendgridApiKey = '***';
            }
            if (settingsData.emailSettings.mailgunApiKey) {
                settingsData.emailSettings.mailgunApiKey = '***';
            }
            if (settingsData.emailSettings.awsSecretAccessKey) {
                settingsData.emailSettings.awsSecretAccessKey = '***';
            }
        }
        
        res.status(200).json({
            success: true,
            data: settingsData
        });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cài đặt',
            error: error.message
        });
    }
}

// Lấy settings theo loại
async function getSettingsByType(req, res) {
    try {
        // Lấy type từ params hoặc từ route path
        let type = req.params?.type;
        if (!type) {
            // Nếu không có trong params, lấy từ path
            const pathParts = req.path.split('/').filter(p => p);
            type = pathParts[pathParts.length - 1] || 'email';
        }
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
            await settings.save();
        }
        
        const settingsData = settings.toObject();
        let result = {};
        
        switch (type) {
            case 'system':
                result = settingsData.systemSettings || {};
                break;
            case 'email':
                result = settingsData.emailSettings || {};
                // Không trả về password/API keys
                if (result.smtpPassword) {
                    result.smtpPassword = '***';
                }
                if (result.resendApiKey) {
                    result.resendApiKey = '***';
                }
                if (result.sendgridApiKey) {
                    result.sendgridApiKey = '***';
                }
                if (result.mailgunApiKey) {
                    result.mailgunApiKey = '***';
                }
                if (result.awsSecretAccessKey) {
                    result.awsSecretAccessKey = '***';
                }
                break;
            case 'payment':
                result = settingsData.paymentSettings || {};
                break;
            case 'notification':
                result = settingsData.notificationSettings || {};
                break;
            case 'general':
                result = settingsData.generalSettings || {};
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Loại cài đặt không hợp lệ'
                });
        }
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting settings by type:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cài đặt',
            error: error.message
        });
    }
}

// Cập nhật system settings
async function updateSystemSettings(req, res) {
    try {
        const systemSettings = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        settings.systemSettings = {
            ...settings.systemSettings,
            ...systemSettings
        };
        settings.updatedBy = userId;
        settings.updatedAt = new Date();
        
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật cài đặt hệ thống',
            data: settings.systemSettings
        });
    } catch (error) {
        console.error('Error updating system settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật cài đặt hệ thống',
            error: error.message
        });
    }
}

// Cập nhật email settings
async function updateEmailSettings(req, res) {
    try {
        const emailSettings = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        // Nếu password/API keys là '***' hoặc rỗng, giữ nguyên giá trị cũ
        if (emailSettings.smtpPassword === '***' || emailSettings.smtpPassword === '' || !emailSettings.smtpPassword) {
            delete emailSettings.smtpPassword;
        }
        if (emailSettings.resendApiKey === '***' || emailSettings.resendApiKey === '' || !emailSettings.resendApiKey) {
            delete emailSettings.resendApiKey;
        }
        if (emailSettings.sendgridApiKey === '***' || emailSettings.sendgridApiKey === '' || !emailSettings.sendgridApiKey) {
            delete emailSettings.sendgridApiKey;
        }
        if (emailSettings.mailgunApiKey === '***' || emailSettings.mailgunApiKey === '' || !emailSettings.mailgunApiKey) {
            delete emailSettings.mailgunApiKey;
        }
        if (emailSettings.awsSecretAccessKey === '***' || emailSettings.awsSecretAccessKey === '' || !emailSettings.awsSecretAccessKey) {
            delete emailSettings.awsSecretAccessKey;
        }
        if (emailSettings.awsAccessKeyId === '***' || emailSettings.awsAccessKeyId === '' || !emailSettings.awsAccessKeyId) {
            delete emailSettings.awsAccessKeyId;
        }
        
        settings.emailSettings = {
            ...settings.emailSettings,
            ...emailSettings
        };
        settings.updatedBy = userId;
        settings.updatedAt = new Date();
        
        await settings.save();
        
        // Không trả về password/API keys
        const responseData = { ...settings.emailSettings };
        if (responseData.smtpPassword) {
            responseData.smtpPassword = '***';
        }
        if (responseData.resendApiKey) {
            responseData.resendApiKey = '***';
        }
        if (responseData.sendgridApiKey) {
            responseData.sendgridApiKey = '***';
        }
        if (responseData.mailgunApiKey) {
            responseData.mailgunApiKey = '***';
        }
        if (responseData.awsSecretAccessKey) {
            responseData.awsSecretAccessKey = '***';
        }
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật cài đặt email',
            data: responseData
        });
    } catch (error) {
        console.error('Error updating email settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật cài đặt email',
            error: error.message
        });
    }
}

// Cập nhật payment settings
async function updatePaymentSettings(req, res) {
    try {
        const paymentSettings = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        // Xử lý bankAccount riêng để merge đúng cách
        const currentPaymentSettings = settings.paymentSettings || {};
        const currentBankAccount = currentPaymentSettings.bankAccount || {};
        const newBankAccount = paymentSettings.bankAccount || {};
        
        // Merge bankAccount với dữ liệu hiện tại
        const mergedBankAccount = {
            ...currentBankAccount,
            ...newBankAccount
        };
        
        // Merge paymentSettings
        settings.paymentSettings = {
            ...currentPaymentSettings,
            ...paymentSettings,
            bankAccount: mergedBankAccount
        };
        
        settings.updatedBy = userId;
        settings.updatedAt = new Date();
        
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật cài đặt thanh toán',
            data: settings.paymentSettings
        });
    } catch (error) {
        console.error('Error updating payment settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật cài đặt thanh toán',
            error: error.message
        });
    }
}

// Cập nhật notification settings
async function updateNotificationSettings(req, res) {
    try {
        const notificationSettings = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        settings.notificationSettings = {
            ...settings.notificationSettings,
            ...notificationSettings
        };
        settings.updatedBy = userId;
        settings.updatedAt = new Date();
        
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật cài đặt thông báo',
            data: settings.notificationSettings
        });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật cài đặt thông báo',
            error: error.message
        });
    }
}

// Cập nhật general settings
async function updateGeneralSettings(req, res) {
    try {
        const generalSettings = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        // Xử lý bankAccount riêng để merge đúng cách
        const currentGeneralSettings = settings.generalSettings || {};
        const currentBankAccount = currentGeneralSettings.bankAccount || {};
        const newBankAccount = generalSettings.bankAccount || {};
        
        // Merge bankAccount với dữ liệu hiện tại
        const mergedBankAccount = {
            ...currentBankAccount,
            ...newBankAccount
        };
        
        // Merge generalSettings
        settings.generalSettings = {
            ...currentGeneralSettings,
            ...generalSettings,
            bankAccount: mergedBankAccount
        };
        
        settings.updatedBy = userId;
        settings.updatedAt = new Date();
        
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật cài đặt chung',
            data: settings.generalSettings
        });
    } catch (error) {
        console.error('Error updating general settings:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật cài đặt chung',
            error: error.message
        });
    }
}

// Test email connection
async function testEmailConnection(req, res) {
    try {
        const emailSettings = req.body;
        
        // Tạm thời set environment variables để test
        const originalProvider = process.env.EMAIL_PROVIDER;
        const originalEnv = {};
        
        // Set env vars dựa trên provider được chọn
        if (emailSettings.emailProvider) {
            process.env.EMAIL_PROVIDER = emailSettings.emailProvider;
            
            switch (emailSettings.emailProvider) {
                case 'resend':
                    if (emailSettings.resendApiKey) {
                        originalEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
                        process.env.RESEND_API_KEY = emailSettings.resendApiKey;
                    }
                    if (emailSettings.emailFrom) {
                        originalEnv.EMAIL_FROM = process.env.EMAIL_FROM;
                        process.env.EMAIL_FROM = emailSettings.emailFrom;
                    }
                    break;
                case 'sendgrid':
                    if (emailSettings.sendgridApiKey) {
                        originalEnv.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
                        process.env.SENDGRID_API_KEY = emailSettings.sendgridApiKey;
                    }
                    if (emailSettings.emailFrom) {
                        originalEnv.EMAIL_FROM = process.env.EMAIL_FROM;
                        process.env.EMAIL_FROM = emailSettings.emailFrom;
                    }
                    break;
                case 'mailgun':
                    if (emailSettings.mailgunApiKey) {
                        originalEnv.MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
                        process.env.MAILGUN_API_KEY = emailSettings.mailgunApiKey;
                    }
                    if (emailSettings.mailgunDomain) {
                        originalEnv.MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
                        process.env.MAILGUN_DOMAIN = emailSettings.mailgunDomain;
                    }
                    break;
                case 'aws-ses':
                    if (emailSettings.awsAccessKeyId) {
                        originalEnv.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
                        process.env.AWS_ACCESS_KEY_ID = emailSettings.awsAccessKeyId;
                    }
                    if (emailSettings.awsSecretAccessKey) {
                        originalEnv.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
                        process.env.AWS_SECRET_ACCESS_KEY = emailSettings.awsSecretAccessKey;
                    }
                    if (emailSettings.awsRegion) {
                        originalEnv.AWS_REGION = process.env.AWS_REGION;
                        process.env.AWS_REGION = emailSettings.awsRegion;
                    }
                    break;
                case 'nodemailer':
                    if (emailSettings.smtpUser) {
                        originalEnv.EMAIL_USER = process.env.EMAIL_USER;
                        process.env.EMAIL_USER = emailSettings.smtpUser;
                    }
                    if (emailSettings.smtpPassword) {
                        originalEnv.EMAIL_PASS = process.env.EMAIL_PASS;
                        process.env.EMAIL_PASS = emailSettings.smtpPassword;
                    }
                    if (emailSettings.smtpHost) {
                        originalEnv.SMTP_HOST = process.env.SMTP_HOST;
                        process.env.SMTP_HOST = emailSettings.smtpHost;
                    }
                    if (emailSettings.smtpPort) {
                        originalEnv.SMTP_PORT = process.env.SMTP_PORT;
                        process.env.SMTP_PORT = emailSettings.smtpPort.toString();
                    }
                    if (emailSettings.smtpSecure !== undefined) {
                        originalEnv.SMTP_SECURE = process.env.SMTP_SECURE;
                        process.env.SMTP_SECURE = emailSettings.smtpSecure.toString();
                    }
                    break;
            }
        }
        
        try {
            // Test connection sử dụng adapter
            const result = await verifyEmailConnection();
            
            // Restore original env vars
            if (originalProvider) process.env.EMAIL_PROVIDER = originalProvider;
            Object.keys(originalEnv).forEach(key => {
                if (originalEnv[key] !== undefined) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
            
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: `Kết nối email thành công (${result.provider})`
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: `Lỗi khi kiểm tra kết nối email: ${result.error}`
                });
            }
        } catch (error) {
            // Restore original env vars
            if (originalProvider) process.env.EMAIL_PROVIDER = originalProvider;
            Object.keys(originalEnv).forEach(key => {
                if (originalEnv[key] !== undefined) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
            throw error;
        }
    } catch (error) {
        console.error('Error testing email connection:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra kết nối email',
            error: error.message
        });
    }
}

// Send test email
async function sendTestEmail(req, res) {
    try {
        const { emailSettings, testAddress } = req.body;
        
        if (!testAddress) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập địa chỉ email test'
            });
        }
        
        // Tạm thời set environment variables để test
        const originalProvider = process.env.EMAIL_PROVIDER;
        const originalEnv = {};
        
        // Set env vars dựa trên provider được chọn
        if (emailSettings.emailProvider) {
            process.env.EMAIL_PROVIDER = emailSettings.emailProvider;
            
            switch (emailSettings.emailProvider) {
                case 'resend':
                    if (emailSettings.resendApiKey) {
                        originalEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
                        process.env.RESEND_API_KEY = emailSettings.resendApiKey;
                    }
                    break;
                case 'sendgrid':
                    if (emailSettings.sendgridApiKey) {
                        originalEnv.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
                        process.env.SENDGRID_API_KEY = emailSettings.sendgridApiKey;
                    }
                    break;
                case 'mailgun':
                    if (emailSettings.mailgunApiKey) {
                        originalEnv.MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
                        process.env.MAILGUN_API_KEY = emailSettings.mailgunApiKey;
                    }
                    if (emailSettings.mailgunDomain) {
                        originalEnv.MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
                        process.env.MAILGUN_DOMAIN = emailSettings.mailgunDomain;
                    }
                    break;
                case 'aws-ses':
                    if (emailSettings.awsAccessKeyId) {
                        originalEnv.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
                        process.env.AWS_ACCESS_KEY_ID = emailSettings.awsAccessKeyId;
                    }
                    if (emailSettings.awsSecretAccessKey) {
                        originalEnv.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
                        process.env.AWS_SECRET_ACCESS_KEY = emailSettings.awsSecretAccessKey;
                    }
                    if (emailSettings.awsRegion) {
                        originalEnv.AWS_REGION = process.env.AWS_REGION;
                        process.env.AWS_REGION = emailSettings.awsRegion;
                    }
                    break;
                case 'nodemailer':
                    if (emailSettings.smtpUser) {
                        originalEnv.EMAIL_USER = process.env.EMAIL_USER;
                        process.env.EMAIL_USER = emailSettings.smtpUser;
                    }
                    if (emailSettings.smtpPassword) {
                        originalEnv.EMAIL_PASS = process.env.EMAIL_PASS;
                        process.env.EMAIL_PASS = emailSettings.smtpPassword;
                    }
                    if (emailSettings.smtpHost) {
                        originalEnv.SMTP_HOST = process.env.SMTP_HOST;
                        process.env.SMTP_HOST = emailSettings.smtpHost;
                    }
                    if (emailSettings.smtpPort) {
                        originalEnv.SMTP_PORT = process.env.SMTP_PORT;
                        process.env.SMTP_PORT = emailSettings.smtpPort.toString();
                    }
                    if (emailSettings.smtpSecure !== undefined) {
                        originalEnv.SMTP_SECURE = process.env.SMTP_SECURE;
                        process.env.SMTP_SECURE = emailSettings.smtpSecure.toString();
                    }
                    break;
            }
        }
        
        const fromEmail = emailSettings.emailFrom || emailSettings.smtpUser || 'noreply@example.com';
        const subject = 'Email Test - Hệ thống quản lý khách sạn';
        const html = `
            <h2>Email Test</h2>
            <p>Đây là email test từ hệ thống quản lý khách sạn.</p>
            <p>Nếu bạn nhận được email này, có nghĩa là cấu hình email đã hoạt động đúng.</p>
            <p>Thời gian gửi: ${new Date().toLocaleString('vi-VN')}</p>
        `;
        const text = `Email Test - Hệ thống quản lý khách sạn\n\nĐây là email test từ hệ thống quản lý khách sạn.\nNếu bạn nhận được email này, có nghĩa là cấu hình email đã hoạt động đúng.\nThời gian gửi: ${new Date().toLocaleString('vi-VN')}`;
        
        try {
            // Gửi email test sử dụng adapter
            const result = await sendEmailAdapter(testAddress, subject, html, text, fromEmail);
            
            // Restore original env vars
            if (originalProvider) process.env.EMAIL_PROVIDER = originalProvider;
            Object.keys(originalEnv).forEach(key => {
                if (originalEnv[key] !== undefined) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
            
            res.status(200).json({
                success: true,
                message: `Đã gửi email test đến ${testAddress} (${result.provider})`
            });
        } catch (error) {
            // Restore original env vars
            if (originalProvider) process.env.EMAIL_PROVIDER = originalProvider;
            Object.keys(originalEnv).forEach(key => {
                if (originalEnv[key] !== undefined) {
                    process.env[key] = originalEnv[key];
                } else {
                    delete process.env[key];
                }
            });
            throw error;
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi gửi email test',
            error: error.message
        });
    }
}

// Lấy tất cả announcements (active)
async function getAnnouncements(req, res) {
    try {
        const mongoose = require('mongoose');
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
            await settings.save();
        }
        
        const user = req.user;
        const userRole = user?.role || (user?.toObject ? user.toObject().role : null);
        const userId = user?._id ? (user._id.toString ? user._id.toString() : user._id) : null;
        
        // Extract businessId với xử lý đúng các format
        let userBusinessId = null;
        if (user?.businessId) {
            if (typeof user.businessId === 'string') {
                userBusinessId = user.businessId;
            } else if (user.businessId instanceof mongoose.Types.ObjectId) {
                userBusinessId = user.businessId;
            } else if (user.businessId._id) {
                userBusinessId = user.businessId._id;
            } else if (user.businessId.toString) {
                userBusinessId = user.businessId.toString();
            }
        }
        
        // Extract hotelId với xử lý đúng các format
        let userHotelId = null;
        if (user?.hotelId) {
            if (typeof user.hotelId === 'string') {
                userHotelId = user.hotelId;
            } else if (user.hotelId instanceof mongoose.Types.ObjectId) {
                userHotelId = user.hotelId;
            } else if (user.hotelId._id) {
                userHotelId = user.hotelId._id;
            } else if (user.hotelId.toString) {
                userHotelId = user.hotelId.toString();
            }
        }
        
        // Convert to string for comparison
        const userBusinessIdStr = userBusinessId ? (typeof userBusinessId === 'string' ? userBusinessId : userBusinessId.toString()) : null;
        const userHotelIdStr = userHotelId ? (typeof userHotelId === 'string' ? userHotelId : userHotelId.toString()) : null;
        
        // Kiểm tra nếu user là superadmin hoặc admin thì thấy tất cả
        const isAdmin = userRole === 'superadmin' || userRole === 'admin';
        
        // Helper function để kiểm tra xem announcement có nên hiển thị không (async)
        const shouldShowAnnouncement = async (announcement) => {
            if (!announcement.isActive) return false;
            if (announcement.endDate && new Date(announcement.endDate) < now) return false;
            if (announcement.startDate && new Date(announcement.startDate) > now) return false;
            
            // Nếu là superadmin hoặc admin, thấy tất cả (trừ khi có userId và không phải của họ - nhưng admin vẫn thấy tất cả)
            // Nếu announcement có userId, chỉ user đó hoặc admin/superadmin mới thấy
            if (announcement.userId) {
                const announcementUserId = announcement.userId.toString ? announcement.userId.toString() : announcement.userId;
                if (!isAdmin && userId !== announcementUserId) {
                    return false; // User thường chỉ thấy announcement của chính mình
                }
            }
            
            // Kiểm tra notificationType: các thông báo booking, checkin, checkout, cancellation, systemError, lowInventory
            // chỉ dành cho business và hotel manager
            const restrictedNotificationTypes = ['booking', 'checkin', 'checkout', 'cancellation', 'systemError', 'lowInventory'];
            const notificationType = announcement.notificationType || 'general';
            
            if (restrictedNotificationTypes.includes(notificationType)) {
                // Chỉ business và hotel manager mới nhận được các thông báo này
                if (userRole !== 'business' && userRole !== 'hotel') {
                    return false;
                }
            }
            
            // Kiểm tra targetType
            const targetType = announcement.targetType || 'system';
            
            // Nếu là system-wide announcement (targetType = 'system' hoặc không có targetBusinesses/targetHotels)
            if (targetType === 'system' || 
                (!announcement.targetBusinesses || announcement.targetBusinesses.length === 0) &&
                (!announcement.targetHotels || announcement.targetHotels.length === 0)) {
                // Chỉ kiểm tra targetRoles
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                return true;
            }
            
            // Nếu là business-specific announcement
            if (targetType === 'business' && announcement.targetBusinesses && announcement.targetBusinesses.length > 0) {
                // Kiểm tra xem user có match với targetBusinesses hoặc targetHotels không
                let matchesBusiness = false;
                let matchesHotel = false;
                
                // Kiểm tra businessId
                if (userBusinessIdStr) {
                    const targetBusinessIds = announcement.targetBusinesses.map(b => 
                        (b._id || b).toString()
                    );
                    matchesBusiness = targetBusinessIds.includes(userBusinessIdStr);
                }
                
                // Kiểm tra hotelId (nếu có targetHotels, hotel manager cũng thấy)
                if (announcement.targetHotels && announcement.targetHotels.length > 0 && userHotelIdStr) {
                    const targetHotelIds = announcement.targetHotels.map(h => 
                        (h._id || h).toString()
                    );
                    matchesHotel = targetHotelIds.includes(userHotelIdStr);
                }
                
                // User phải match với ít nhất một trong hai (business hoặc hotel)
                if (!matchesBusiness && !matchesHotel) {
                    return false;
                }
                
                // Kiểm tra targetRoles nếu có
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                
                return true;
            }
            
            // Nếu là hotel-specific announcement
            if (targetType === 'hotel' && announcement.targetHotels && announcement.targetHotels.length > 0) {
                // Kiểm tra xem user có match với targetHotels hoặc targetBusinesses không
                let matchesHotel = false;
                let matchesBusiness = false;
                
                // Kiểm tra hotelId
                if (userHotelIdStr) {
                    const targetHotelIds = announcement.targetHotels.map(h => 
                        (h._id || h).toString()
                    );
                    matchesHotel = targetHotelIds.includes(userHotelIdStr);
                }
                
                // Kiểm tra businessId (nếu có targetBusinesses, business owner cũng thấy)
                if (announcement.targetBusinesses && announcement.targetBusinesses.length > 0 && userBusinessIdStr) {
                    const targetBusinessIds = announcement.targetBusinesses.map(b => 
                        (b._id || b).toString()
                    );
                    matchesBusiness = targetBusinessIds.includes(userBusinessIdStr);
                }
                
                // User phải match với ít nhất một trong hai (hotel hoặc business)
                if (!matchesHotel && !matchesBusiness) {
                    return false;
                }
                
                // Kiểm tra targetRoles nếu có
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                
                // Kiểm tra điều kiện hiển thị thông báo khách sạn:
                // 1. Có bật trong system settings HOẶC
                // 2. Có bật trong hotel settings HOẶC
                // 3. Có bật hotelNotificationFeature trong package subscription
                let canViewHotelNotification = false;
                
                try {
                    const Hotel = require('../models/hotel').Hotel;
                    const User = require('../models/users').User;
                    const PricingPackage = require('../models/pricingPackage');
                    
                    // Lấy hotel để kiểm tra settings
                    let hotelToCheck = null;
                    if (userHotelIdStr) {
                        hotelToCheck = await Hotel.findById(userHotelIdStr).lean();
                    } else if (userBusinessIdStr) {
                        // Nếu là business, lấy hotel đầu tiên thuộc business
                        const hotels = await Hotel.find({ businessId: userBusinessIdStr }).limit(1).lean();
                        if (hotels.length > 0) {
                            hotelToCheck = hotels[0];
                        }
                    }
                    
                    // Kiểm tra system settings
                    const systemNotificationSettings = settings.notificationSettings || {};
                    const notificationType = announcement.notificationType || 'general';
                    const notificationTypeMap = {
                        'booking': 'notifyOnBooking',
                        'checkin': 'notifyOnCheckin',
                        'checkout': 'notifyOnCheckout',
                        'cancellation': 'notifyOnCancellation',
                        'maintenance': 'notifyOnMaintenance',
                        'transfer': 'notifyOnTransfer',
                        'systemError': 'notifyOnSystemError',
                        'lowInventory': 'notifyOnLowInventory'
                    };
                    const notifyOnKey = notificationTypeMap[notificationType] || null;
                    
                    if (notifyOnKey) {
                        // Kiểm tra system settings
                        const isSystemEnabled = systemNotificationSettings[notifyOnKey] !== false;
                        
                        // Kiểm tra hotel settings
                        let isHotelEnabled = false;
                        if (hotelToCheck && hotelToCheck.settings && hotelToCheck.settings.notificationSettings) {
                            isHotelEnabled = hotelToCheck.settings.notificationSettings[notifyOnKey] !== false;
                        }
                        
                        // Kiểm tra package feature
                        let hasPackageFeature = false;
                        if (user?._id) {
                            const userWithPackage = await User.findById(user._id)
                                .populate('pricingPackage')
                                .lean();
                            
                            if (userWithPackage && userWithPackage.pricingPackage) {
                                const packageData = userWithPackage.pricingPackage;
                                hasPackageFeature = packageData.hotelNotificationFeature === true;
                                
                                // Kiểm tra package còn hạn không
                                if (userWithPackage.packageExpiryDate) {
                                    const expiryDate = new Date(userWithPackage.packageExpiryDate);
                                    if (expiryDate < new Date()) {
                                        hasPackageFeature = false; // Package đã hết hạn
                                    }
                                }
                            }
                        }
                        
                        // Chỉ hiển thị nếu một trong ba điều kiện được thỏa mãn
                        canViewHotelNotification = isSystemEnabled || isHotelEnabled || hasPackageFeature;
                    } else {
                        // Nếu không có notificationType hoặc không trong map, cho phép hiển thị (tương thích ngược)
                        canViewHotelNotification = true;
                    }
                } catch (checkError) {
                    console.error('[getAnnouncements] Error checking hotel notification permission:', checkError);
                    // Nếu có lỗi, không chặn việc hiển thị (tương thích ngược)
                    canViewHotelNotification = true;
                }
                
                if (!canViewHotelNotification) {
                    return false; // Không có quyền xem thông báo khách sạn
                }
                
                return true;
            }
            
            return false;
        };
        
        // Lọc announcements: chỉ lấy active và chưa hết hạn (sử dụng Promise.all cho async filter)
        const now = new Date();
        const allAnnouncements = settings.announcements || [];
        const announcementPromises = allAnnouncements.map(announcement => shouldShowAnnouncement(announcement));
        const announcementResults = await Promise.all(announcementPromises);
        let announcements = allAnnouncements.filter((_, index) => announcementResults[index]);
        
        // Sắp xếp theo priority và createdAt
        announcements.sort((a, b) => {
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Lấy danh sách announcement IDs đã đọc của user
        const User = require('../models/users').User;
        const userReadAnnouncements = user?._id ? 
            (await User.findById(user._id).select('readAnnouncements'))?.readAnnouncements || [] : [];
        
        // Thêm thông tin isRead vào mỗi announcement
        const announcementsWithReadStatus = announcements.map(announcement => ({
            ...announcement.toObject ? announcement.toObject() : announcement,
            isRead: userReadAnnouncements.includes(announcement.id)
        }));
        
        res.status(200).json({
            success: true,
            data: announcementsWithReadStatus,
            unreadCount: announcementsWithReadStatus.filter(a => !a.isRead).length
        });
    } catch (error) {
        console.error('Error getting announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thông báo',
            error: error.message
        });
    }
}

// Tạo announcement mới
async function createAnnouncement(req, res) {
    try {
        const { type, title, message, priority, startDate, endDate, targetRoles, targetBusinesses, targetHotels, targetType, notificationType, userId: announcementUserId } = req.body;
        const userId = req.user?._id;
        
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Tiêu đề và nội dung thông báo là bắt buộc'
            });
        }
        
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        const mongoose = require('mongoose');
        const announcementId = new mongoose.Types.ObjectId().toString();
        
        // Convert targetBusinesses và targetHotels thành ObjectId nếu là string
        let targetBusinessesIds = [];
        if (targetBusinesses && Array.isArray(targetBusinesses) && targetBusinesses.length > 0) {
            targetBusinessesIds = targetBusinesses.map(b => {
                if (typeof b === 'string') {
                    return new mongoose.Types.ObjectId(b);
                }
                return b._id || b;
            });
        }
        
        let targetHotelsIds = [];
        if (targetHotels && Array.isArray(targetHotels) && targetHotels.length > 0) {
            targetHotelsIds = targetHotels.map(h => {
                if (typeof h === 'string') {
                    return new mongoose.Types.ObjectId(h);
                }
                return h._id || h;
            });
        }
        
        // Convert announcementUserId thành ObjectId nếu có
        let announcementUserIdObj = null;
        if (announcementUserId) {
            if (typeof announcementUserId === 'string') {
                announcementUserIdObj = new mongoose.Types.ObjectId(announcementUserId);
            } else {
                announcementUserIdObj = announcementUserId._id || announcementUserId;
            }
        }
        
        const newAnnouncement = {
            id: announcementId,
            type: type || 'info',
            title,
            message,
            priority: priority || 'medium',
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null,
            isActive: true,
            targetRoles: targetRoles || [],
            targetBusinesses: targetBusinessesIds,
            targetHotels: targetHotelsIds,
            targetType: targetType || (targetBusinessesIds.length > 0 ? 'business' : (targetHotelsIds.length > 0 ? 'hotel' : 'system')),
            notificationType: notificationType || 'general', // Loại thông báo để map với notifyOn* settings
            userId: announcementUserIdObj, // User ID của người dùng liên quan (cho thông báo gói, đăng ký, liên hệ)
            createdAt: new Date(),
            createdBy: userId
        };
        
        if (!settings.announcements) {
            settings.announcements = [];
        }
        
        settings.announcements.push(newAnnouncement);
        await settings.save();
        
        res.status(201).json({
            success: true,
            message: 'Đã tạo thông báo mới',
            data: newAnnouncement
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo thông báo',
            error: error.message
        });
    }
}

// Cập nhật announcement
async function updateAnnouncement(req, res) {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const userId = req.user?._id;
        
        let settings = await Settings.findOne();
        
        if (!settings || !settings.announcements) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }
        
        const announcement = settings.announcements.find(a => a.id === id);
        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }
        
        // Cập nhật các trường được phép
        const mongoose = require('mongoose');
        
        if (updateData.type) announcement.type = updateData.type;
        if (updateData.title) announcement.title = updateData.title;
        if (updateData.message) announcement.message = updateData.message;
        if (updateData.priority) announcement.priority = updateData.priority;
        if (updateData.startDate) announcement.startDate = new Date(updateData.startDate);
        if (updateData.endDate !== undefined) announcement.endDate = updateData.endDate ? new Date(updateData.endDate) : null;
        if (updateData.isActive !== undefined) announcement.isActive = updateData.isActive;
        if (updateData.targetRoles) announcement.targetRoles = updateData.targetRoles;
        if (updateData.targetType) announcement.targetType = updateData.targetType;
        
        // Cập nhật targetBusinesses
        if (updateData.targetBusinesses !== undefined) {
            if (Array.isArray(updateData.targetBusinesses) && updateData.targetBusinesses.length > 0) {
                announcement.targetBusinesses = updateData.targetBusinesses.map(b => {
                    if (typeof b === 'string') {
                        return new mongoose.Types.ObjectId(b);
                    }
                    return b._id || b;
                });
            } else {
                announcement.targetBusinesses = [];
            }
        }
        
        // Cập nhật targetHotels
        if (updateData.targetHotels !== undefined) {
            if (Array.isArray(updateData.targetHotels) && updateData.targetHotels.length > 0) {
                announcement.targetHotels = updateData.targetHotels.map(h => {
                    if (typeof h === 'string') {
                        return new mongoose.Types.ObjectId(h);
                    }
                    return h._id || h;
                });
            } else {
                announcement.targetHotels = [];
            }
        }
        if (updateData.notificationType) announcement.notificationType = updateData.notificationType;
        
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã cập nhật thông báo',
            data: announcement
        });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật thông báo',
            error: error.message
        });
    }
}

// Đánh dấu announcement đã đọc
async function markAnnouncementAsRead(req, res) {
    try {
        const { id } = req.params;
        const userId = req.user?._id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập'
            });
        }
        
        const User = require('../models/users').User;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }
        
        // Thêm announcement ID vào danh sách đã đọc (nếu chưa có)
        if (!user.readAnnouncements || !Array.isArray(user.readAnnouncements)) {
            user.readAnnouncements = [];
        }
        
        if (!user.readAnnouncements.includes(id)) {
            user.readAnnouncements.push(id);
            await user.save();
        }
        
        res.status(200).json({
            success: true,
            message: 'Đã đánh dấu đã đọc'
        });
    } catch (error) {
        console.error('Error marking announcement as read:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đánh dấu đã đọc',
            error: error.message
        });
    }
}

// Đánh dấu tất cả announcements đã đọc
async function markAllAnnouncementsAsRead(req, res) {
    try {
        const userId = req.user?._id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập'
            });
        }
        
        // Lấy tất cả announcement IDs hiện tại
        let settings = await Settings.findOne();
        const allAnnouncementIds = (settings?.announcements || [])
            .filter(a => a.isActive)
            .map(a => a.id);
        
        const User = require('../models/users').User;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }
        
        // Cập nhật danh sách đã đọc với tất cả announcement IDs
        user.readAnnouncements = [...new Set([...(user.readAnnouncements || []), ...allAnnouncementIds])];
        await user.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã đánh dấu tất cả đã đọc'
        });
    } catch (error) {
        console.error('Error marking all announcements as read:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi đánh dấu tất cả đã đọc',
            error: error.message
        });
    }
}

// Lấy số lượng thông báo chưa đọc
async function getUnreadAnnouncementsCount(req, res) {
    try {
        const userId = req.user?._id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Chưa đăng nhập'
            });
        }
        
        // Lấy tất cả announcements active
        let settings = await Settings.findOne();
        const user = req.user;
        const userRole = user?.role || (user?.toObject ? user.toObject().role : null);
        const userBusinessId = user?.businessId ? (user.businessId._id || user.businessId) : null;
        const userHotelId = user?.hotelId ? (user.hotelId._id || user.hotelId) : null;
        
        const userBusinessIdStr = userBusinessId ? userBusinessId.toString() : null;
        const userHotelIdStr = userHotelId ? userHotelId.toString() : null;
        
        const now = new Date();
        let announcements = (settings?.announcements || []).filter(announcement => {
            if (!announcement.isActive) return false;
            if (announcement.endDate && new Date(announcement.endDate) < now) return false;
            if (announcement.startDate && new Date(announcement.startDate) > now) return false;
            
            // Kiểm tra notificationType: các thông báo booking, checkin, checkout, cancellation, systemError, lowInventory
            // chỉ dành cho business và hotel manager
            const restrictedNotificationTypes = ['booking', 'checkin', 'checkout', 'cancellation', 'systemError', 'lowInventory'];
            const notificationType = announcement.notificationType || 'general';
            
            if (restrictedNotificationTypes.includes(notificationType)) {
                // Chỉ business và hotel manager mới nhận được các thông báo này
                if (userRole !== 'business' && userRole !== 'hotel') {
                    return false;
                }
            }
            
            const targetType = announcement.targetType || 'system';
            
            if (targetType === 'system' || 
                (!announcement.targetBusinesses || announcement.targetBusinesses.length === 0) &&
                (!announcement.targetHotels || announcement.targetHotels.length === 0)) {
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                return true;
            }
            
            if (targetType === 'business' && announcement.targetBusinesses && announcement.targetBusinesses.length > 0) {
                if (!userBusinessIdStr) return false;
                const targetBusinessIds = announcement.targetBusinesses.map(b => 
                    (b._id || b).toString()
                );
                if (!targetBusinessIds.includes(userBusinessIdStr)) {
                    return false;
                }
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                return true;
            }
            
            if (targetType === 'hotel' && announcement.targetHotels && announcement.targetHotels.length > 0) {
                if (!userHotelIdStr) return false;
                const targetHotelIds = announcement.targetHotels.map(h => 
                    (h._id || h).toString()
                );
                if (!targetHotelIds.includes(userHotelIdStr)) {
                    return false;
                }
                if (announcement.targetRoles && announcement.targetRoles.length > 0) {
                    if (!userRole || !announcement.targetRoles.includes(userRole)) {
                        return false;
                    }
                }
                return true;
            }
            
            return false;
        });
        
        // Lấy danh sách đã đọc của user
        const User = require('../models/users').User;
        const userReadAnnouncements = (await User.findById(userId).select('readAnnouncements'))?.readAnnouncements || [];
        
        // Đếm số lượng chưa đọc
        const unreadCount = announcements.filter(a => !userReadAnnouncements.includes(a.id)).length;
        
        // Phân loại theo targetType
        const systemCount = announcements.filter(a => 
            (a.targetType === 'system' || !a.targetType) && !userReadAnnouncements.includes(a.id)
        ).length;
        const hotelCount = announcements.filter(a => 
            a.targetType === 'hotel' && !userReadAnnouncements.includes(a.id)
        ).length;
        
        res.status(200).json({
            success: true,
            data: {
                total: unreadCount,
                system: systemCount,
                hotel: hotelCount
            }
        });
    } catch (error) {
        console.error('Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy số lượng chưa đọc',
            error: error.message
        });
    }
}

// Xóa announcement
async function deleteAnnouncement(req, res) {
    try {
        const { id } = req.params;
        
        let settings = await Settings.findOne();
        
        if (!settings || !settings.announcements) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }
        
        const index = settings.announcements.findIndex(a => a.id === id);
        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy thông báo'
            });
        }
        
        settings.announcements.splice(index, 1);
        await settings.save();
        
        res.status(200).json({
            success: true,
            message: 'Đã xóa thông báo'
        });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa thông báo',
            error: error.message
        });
    }
}

module.exports = {
    getAllSettings,
    getSettingsByType,
    updateSystemSettings,
    updateEmailSettings,
    updatePaymentSettings,
    updateNotificationSettings,
    updateGeneralSettings,
    testEmailConnection,
    sendTestEmail,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    markAnnouncementAsRead,
    markAllAnnouncementsAsRead,
    getUnreadAnnouncementsCount
};

