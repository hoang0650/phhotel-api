const dotenv = require('dotenv');
dotenv.config();

/**
 * CẤU HÌNH EMAIL - Sử dụng Email Service Adapter
 * 
 * Hỗ trợ nhiều email providers:
 * - resend: Hiện đại, miễn phí 3000 email/tháng (KHUYẾN NGHỊ)
 * - sendgrid: Phổ biến, miễn phí 100 email/ngày
 * - mailgun: Tốt cho transactional email
 * - aws-ses: Giá rẻ, scale tốt
 * - nodemailer: SMTP truyền thống (mặc định)
 * 
 * Xem EMAIL_SERVICE_SETUP.md để biết cách cấu hình từng provider
 * 
 * Cấu hình trong .env:
 * EMAIL_PROVIDER=resend|sendgrid|mailgun|aws-ses|nodemailer
 * 
 * Ví dụ với Resend (KHUYẾN NGHỊ):
 * EMAIL_PROVIDER=resend
 * RESEND_API_KEY=re_xxxxx
 * EMAIL_FROM=noreply@yourdomain.com
 * 
 * Ví dụ với Nodemailer (SMTP):
 * EMAIL_PROVIDER=nodemailer
 * EMAIL_USER=email@gmail.com
 * EMAIL_PASS=password
 * SMTP_HOST=smtp.gmail.com
 * SMTP_PORT=587
 */

const { sendEmail: sendEmailAdapter, sendEmailTemplate, verifyConnection, EMAIL_PROVIDER } = require('./emailServiceAdapter');
const { Settings } = require('../models/settings');

// Kiểm tra provider và log thông tin
console.log(`📧 Email Provider: ${EMAIL_PROVIDER || 'nodemailer (default)'}`);

// Kiểm tra kết nối khi khởi động (chỉ khi không có SKIP_EMAIL)
if (process.env.SKIP_EMAIL !== 'true' && process.env.SKIP_EMAIL !== '1') {
  verifyConnection().then(result => {
    if (result.success) {
      console.log(`✅ Email service (${result.provider}) is ready to send messages`);
    } else {
      console.warn(`⚠️  Email service connection warning: ${result.error}`);
      console.warn('⚠️  Tính năng gửi email có thể không hoạt động');
    }
  }).catch(err => {
    console.warn('⚠️  Email service connection check failed:', err.message);
  });
}

function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const sendEmail = async (toEmail, order) => {
  const orderDetails = order.items.map(item => {
    return `- Tên sản phẩm: ${item.name}\n  Số lượng: ${item.quantity}\n  Kích thước: ${item.variants.size}\n  Màu sắc/Loại: ${item.variants.color}\n Giá: ${formatNumber(item.price)} VND`;
  }).join('\n');

  const subject = `Xác nhận đơn hàng ${order.orderId}`;
  const text = `Cảm ơn bạn đã đặt hàng!\n\nChi tiết đơn hàng của bạn:\n\nMã đơn hàng: ${order.orderId}\n\nSản phẩm:\n${orderDetails}\n\nThành tiền: ${formatNumber(order.subtotal)} VNĐ\n\nGiảm giá: ${formatNumber(order.discount)} VNĐ\n\nTổng tiền: ${formatNumber(order.totalPrice)} VND`;
  const fromEmail = process.env.EMAIL_FROM || 'noreply@nintshop.com';

  try {
    const result = await sendEmailAdapter(toEmail, subject, null, text, fromEmail);
    console.log(`Email sent via ${result.provider}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

const sendForgotPasswordEmail = async (toEmail, token, emailFrom = null) => {
  const resetUrl = `${process.env.APP_URL || 'http://localhost:4200'}/reset-password/${token}`;
  
  // Kiểm tra nếu có SKIP_EMAIL=true trong .env (dùng cho development)
  const skipEmail = process.env.SKIP_EMAIL === 'true' || process.env.SKIP_EMAIL === '1';
  
  if (skipEmail) {
    console.log('⚠️  SKIP_EMAIL is enabled - Email sẽ không được gửi');
    console.log('📧 Reset password email would be sent to:', toEmail);
    console.log('📤 Email from:', process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@phhotel.vn');
    console.log('🔗 Reset URL:', resetUrl);
    console.log('🔑 Reset Token:', token);
    // Trả về success giả để không break flow
    return Promise.resolve({ messageId: 'skipped', response: 'Email skipped in development mode' });
  }
  
  // Kiểm tra nếu không có cấu hình email (chỉ cho nodemailer)
  if (EMAIL_PROVIDER === 'nodemailer' && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    console.warn('⚠️  EMAIL_USER hoặc EMAIL_PASS chưa được cấu hình (cho nodemailer)');
    console.log('📧 Reset password email would be sent to:', toEmail);
    console.log('📤 Email from:', process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@nintshop.com');
    console.log('🔗 Reset URL:', resetUrl);
    console.log('🔑 Reset Token:', token);
    // Trả về success giả để không break flow
    return Promise.resolve({ messageId: 'skipped', response: 'Email skipped - no email config' });
  }
  
  // Lấy email settings từ database nếu có
  let emailSettings = null;
  try {
    const settingsDoc = await Settings.findOne();
    emailSettings = settingsDoc?.emailSettings || null;
  } catch (e) {
    emailSettings = null;
  }
  const provider = (emailSettings?.emailProvider || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
  // Xác định email "from": luôn dùng hệ thống (settings/.env), không lấy từ request
  const fromEmail = emailSettings?.emailFrom || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@nintshop.com';
  
  const subject = 'Đặt lại mật khẩu';
  const appName = process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel';
  const expireTime = '1 giờ';
  const backendUrl = process.env.BACKEND_PUBLIC_URL || process.env.API_URL || process.env.API_BASE_URL || 'http://localhost:3000';
  const logoUrl = `${backendUrl}/images/phgroup_logo_circle.PNG`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
      <div style="text-align:center; padding: 24px 0;">
        <img src="${logoUrl}" alt="${appName}" style="width:48px;height:48px;border-radius:12px;display:block;margin:0 auto 8px auto;" />
        <div style="font-size: 14px; color: #64748b;">${appName}</div>
      </div>
      <div style="text-align:center; margin-bottom: 12px; color:#1f2937;">
        <span style="font-size:16px;">🔒 Đặt lại mật khẩu</span>
      </div>
      <div style="margin-top:16px; font-size:15px; line-height:1.6;">
        <p>Xin chào <strong>${toEmail}</strong>,</p>
        <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản <strong>${appName}</strong>.</p>
      </div>
      <div style="text-align:center; margin: 28px 0;">
        <a href="${resetUrl}" style="background-color:#1a73e8; color:#ffffff; padding: 12px 20px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600;">Đặt lại mật khẩu</a>
      </div>
      <div style="margin-top:8px; font-size:13px; color:#475569;">
        <p>🔗 Liên kết có hiệu lực trong <strong>${expireTime}</strong>.</p>
        <p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>
      </div>
      <div style="text-align:center; margin-top:32px; font-size:12px; color:#64748b;">
        © ${appName} • Vui lòng không trả lời email này
      </div>
    </div>
  `;
  const text = `Xin chào ${toEmail},

Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản ${appName}.
Truy cập liên kết sau để đặt lại mật khẩu: ${resetUrl}

Liên kết có hiệu lực trong ${expireTime}.
Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.

© ${appName}`;

  try {
    const isResend = provider === 'resend';
    const resetTemplateId = emailSettings?.resendTemplateResetId || emailSettings?.resendTemplateResetAlias || process.env.RESEND_TEMPLATE_RESET_PASSWORD_ID || process.env.RESEND_TEMPLATE_RESET_ALIAS;
    if (isResend && resetTemplateId) {
      const variables = {
        appName: process.env.APP_NAME || emailSettings?.emailFromName || 'PHHotel',
        userName: toEmail,
        resetUrl: resetUrl,
        resetLink: resetUrl,
        logoUrl: logoUrl,
        expireTime: '1 giờ'
      };
      const overrides = { from: fromEmail };
      const result = await sendEmailTemplate(toEmail, resetTemplateId, variables, overrides, emailSettings || undefined);
      console.log(`Forgot password email sent via ${result.provider} template: ${result.messageId}`);
      return result;
    }
    const result = await sendEmailAdapter(toEmail, subject, html, text, fromEmail, emailSettings || undefined);
    console.log(`Forgot password email sent via ${result.provider}: ${result.messageId}`);
    return result;
  } catch (error) {
    console.error('Error sending forgot password email:', error);
    // Log chi tiết lỗi để debug
    if (error.message && error.message.includes('timeout')) {
      console.error('Connection timeout - Kiểm tra cấu hình email provider trong .env');
      console.error('Xem EMAIL_SERVICE_SETUP.md để biết cách cấu hình');
    } else if (error.message && error.message.includes('API')) {
      console.error('API key error - Kiểm tra API key của email provider');
    }
    throw error;
  }
};

module.exports = {sendEmail,sendForgotPasswordEmail };
