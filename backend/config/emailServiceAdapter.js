const dotenv = require('dotenv');
dotenv.config();

/**
 * EMAIL SERVICE ADAPTER
 * 
 * Hỗ trợ nhiều email service providers:
 * - resend: Hiện đại, miễn phí 3000 email/tháng, API đơn giản (KHUYẾN NGHỊ)
 * - sendgrid: Phổ biến, miễn phí 100 email/ngày
 * - mailgun: Tốt cho transactional email
 * - aws-ses: Giá rẻ, scale tốt
 * - nodemailer: Fallback cho SMTP truyền thống
 * 
 * Cấu hình trong .env:
 * EMAIL_PROVIDER=resend|sendgrid|mailgun|aws-ses|nodemailer
 * 
 * Resend (KHUYẾN NGHỊ):
 * - EMAIL_PROVIDER=resend
 * - RESEND_API_KEY=re_xxxxx
 * - EMAIL_FROM=noreply@yourdomain.com (phải verify domain trước)
 * 
 * SendGrid:
 * - EMAIL_PROVIDER=sendgrid
 * - SENDGRID_API_KEY=SG.xxxxx
 * - EMAIL_FROM=noreply@yourdomain.com
 * 
 * Mailgun:
 * - EMAIL_PROVIDER=mailgun
 * - MAILGUN_API_KEY=xxxxx
 * - MAILGUN_DOMAIN=yourdomain.com
 * 
 * AWS SES:
 * - EMAIL_PROVIDER=aws-ses
 * - AWS_ACCESS_KEY_ID=xxxxx
 * - AWS_SECRET_ACCESS_KEY=xxxxx
 * - AWS_REGION=us-east-1
 * 
 * Nodemailer (SMTP):
 * - EMAIL_PROVIDER=nodemailer
 * - EMAIL_USER=email@gmail.com
 * - EMAIL_PASS=password
 * - SMTP_HOST=smtp.gmail.com
 * - SMTP_PORT=587
 */

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'nodemailer';

// ============ RESEND (KHUYẾN NGHỊ) ============
async function sendWithResend(to, subject, html, text, from = null, emailSettings = null) {
  let resendModule;
  try {
    resendModule = require('resend');
  } catch (error) {
    throw new Error('Package "resend" chưa được cài đặt. Chạy: npm install resend');
  }
  
  const apiKey = emailSettings?.resendApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY chưa được cấu hình');
  }
  
  const Resend = resendModule.Resend || resendModule.default || resendModule;
  const resend = new Resend(apiKey);
  
  const fromEmail = from || emailSettings?.emailFrom || process.env.EMAIL_FROM || process.env.RESEND_FROM;
  if (!fromEmail) {
    throw new Error('EMAIL_FROM chưa được cấu hình');
  }
  
  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
    html: html || text,
    text: text
  });
  
  if (error) {
    // Xử lý lỗi Resend cụ thể
    let errorMessage = error.message || 'Unknown error';
    
    // Kiểm tra nếu là lỗi về domain chưa verify
    if (errorMessage.includes('testing emails') || errorMessage.includes('verify a domain')) {
      errorMessage = `Resend: Bạn chỉ có thể gửi email test đến email đăng ký của bạn. Để gửi email đến các địa chỉ khác, vui lòng verify domain tại https://resend.com/domains và sử dụng email từ domain đã verify làm địa chỉ "From". Lỗi chi tiết: ${error.message}`;
    }
    
    throw new Error(errorMessage);
  }
  
  return { messageId: data.id, provider: 'resend' };
}

// Gửi bằng Resend Templates
async function sendWithResendTemplate(to, templateIdOrAlias, variables = {}, overrides = {}, emailSettings = null) {
  let resendModule;
  try {
    resendModule = require('resend');
  } catch (error) {
    throw new Error('Package "resend" chưa được cài đặt. Chạy: npm install resend');
  }
  const apiKey = emailSettings?.resendApiKey || process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY chưa được cấu hình');
  }
  const Resend = resendModule.Resend || resendModule.default || resendModule;
  const resend = new Resend(apiKey);
  const fromEmail = overrides?.from || emailSettings?.emailFrom || process.env.EMAIL_FROM || process.env.RESEND_FROM;
  if (!fromEmail) {
    throw new Error('EMAIL_FROM chưa được cấu hình');
  }
  const payload = {
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject: overrides?.subject,
    replyTo: overrides?.replyTo,
    template: {
      id: templateIdOrAlias,
      variables: variables || {}
    }
  };
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    let errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('template')) {
      errorMessage = `Resend: Template không hợp lệ hoặc chưa publish. Kiểm tra template id/alias và biến variables. Lỗi: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
  return { messageId: data.id, provider: 'resend' };
}

// ============ SENDGRID ============
async function sendWithSendGrid(to, subject, html, text, from = null, emailSettings = null) {
  let sgMail;
  try {
    sgMail = require('@sendgrid/mail');
  } catch (error) {
    throw new Error('Package "@sendgrid/mail" chưa được cài đặt. Chạy: npm install @sendgrid/mail');
  }
  
  const apiKey = emailSettings?.sendgridApiKey || process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY chưa được cấu hình');
  }
  
  sgMail.setApiKey(apiKey);
  
  const fromEmail = from || emailSettings?.emailFrom || process.env.EMAIL_FROM || 'noreply@example.com';
  
  const msg = {
    to: Array.isArray(to) ? to : [to],
    from: fromEmail,
    subject: subject,
    text: text,
    html: html || text
  };

  const [response] = await sgMail.send(msg);
  return { messageId: response.headers['x-message-id'], provider: 'sendgrid' };
}

// ============ MAILGUN ============
async function sendWithMailgun(to, subject, html, text, from = null, emailSettings = null) {
  let formData, Mailgun;
  try {
    formData = require('form-data');
    Mailgun = require('mailgun.js');
  } catch (error) {
    throw new Error('Packages "mailgun.js" và "form-data" chưa được cài đặt. Chạy: npm install mailgun.js form-data');
  }
  
  const apiKey = emailSettings?.mailgunApiKey || process.env.MAILGUN_API_KEY;
  const domain = emailSettings?.mailgunDomain || process.env.MAILGUN_DOMAIN;
  
  if (!apiKey || !domain) {
    throw new Error('MAILGUN_API_KEY hoặc MAILGUN_DOMAIN chưa được cấu hình');
  }
  
  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({
    username: 'api',
    key: apiKey
  });
  
  const fromEmail = from || emailSettings?.emailFrom || process.env.EMAIL_FROM || `noreply@${domain}`;
  
  const messageData = {
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
    text: text,
    html: html || text
  };
  
  const response = await mg.messages.create(domain, messageData);
  return { messageId: response.id, provider: 'mailgun' };
}

// ============ AWS SES ============
async function sendWithAWSSES(to, subject, html, text, from = null, emailSettings = null) {
  let AWS;
  try {
    AWS = require('aws-sdk');
  } catch (error) {
    throw new Error('Package "aws-sdk" chưa được cài đặt. Chạy: npm install aws-sdk');
  }
  
  const accessKeyId = emailSettings?.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = emailSettings?.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
  const region = emailSettings?.awsRegion || process.env.AWS_REGION || 'us-east-1';
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials chưa được cấu hình');
  }
  
  const ses = new AWS.SES({
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
    region: region
  });
  
  const fromEmail = from || emailSettings?.emailFrom || process.env.EMAIL_FROM || 'noreply@example.com';
  
  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to]
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: html || text,
          Charset: 'UTF-8'
        },
        Text: {
          Data: text,
          Charset: 'UTF-8'
        }
      }
    }
  };
  
  const result = await ses.sendEmail(params).promise();
  return { messageId: result.MessageId, provider: 'aws-ses' };
}

// ============ NODEMAILER (SMTP) ============
async function sendWithNodemailer(to, subject, html, text, from = null, emailSettings = null) {
  const nodemailer = require('nodemailer');
  
  const smtpUser = emailSettings?.smtpUser || process.env.EMAIL_USER;
  const smtpPassword = emailSettings?.smtpPassword || process.env.EMAIL_PASS;
  const smtpHost = emailSettings?.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = emailSettings?.smtpPort || parseInt(process.env.SMTP_PORT) || 587;
  const smtpSecure = emailSettings?.smtpSecure !== undefined ? emailSettings.smtpSecure : (process.env.SMTP_SECURE === 'true' || false);
  
  if (!smtpUser || !smtpPassword) {
    throw new Error('SMTP User hoặc SMTP Password chưa được cấu hình');
  }
  
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword
    },
    connectionTimeout: 30000, // Tăng timeout lên 30s
    greetingTimeout: 10000,
    socketTimeout: 30000, // Tăng timeout lên 30s
    pool: true,
    maxConnections: 1,
    maxMessages: 3
  });
  
  const fromEmail = from || emailSettings?.emailFrom || process.env.EMAIL_FROM || smtpUser;
  
  const mailOptions = {
    from: fromEmail,
    to: Array.isArray(to) ? to : [to],
    subject: subject,
    html: html || text,
    text: text
  };
  
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve({ messageId: info.messageId, provider: 'nodemailer' });
      }
    });
  });
}

// ============ ADAPTER FUNCTION ============
/**
 * Gửi email thông qua provider được cấu hình
 * @param {string|string[]} to - Email người nhận
 * @param {string} subject - Chủ đề email
 * @param {string} html - Nội dung HTML
 * @param {string} text - Nội dung text
 * @param {string} from - Email người gửi (optional)
 * @param {object} emailSettings - Email settings từ database (optional, nếu không có sẽ dùng .env)
 */
async function sendEmail(to, subject, html, text, from = null, emailSettings = null) {
  try {
    // Xác định provider: ưu tiên từ emailSettings, sau đó từ .env
    const provider = (emailSettings?.emailProvider || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
    
    switch (provider) {
      case 'resend':
        return await sendWithResend(to, subject, html, text, from, emailSettings);
      
      case 'sendgrid':
        return await sendWithSendGrid(to, subject, html, text, from, emailSettings);
      
      case 'mailgun':
        return await sendWithMailgun(to, subject, html, text, from, emailSettings);
      
      case 'aws-ses':
      case 'awsses':
        return await sendWithAWSSES(to, subject, html, text, from, emailSettings);
      
      case 'nodemailer':
      case 'smtp':
      default:
        return await sendWithNodemailer(to, subject, html, text, from, emailSettings);
    }
  } catch (error) {
    const provider = (emailSettings?.emailProvider || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
    console.error(`Error sending email with ${provider}:`, error);
    throw error;
  }
}

// Gửi email sử dụng Template (chỉ hỗ trợ Resend)
async function sendEmailTemplate(to, templateIdOrAlias, variables = {}, overrides = {}, emailSettings = null) {
  const provider = (emailSettings?.emailProvider || EMAIL_PROVIDER || 'nodemailer').toLowerCase();
  if (provider !== 'resend') {
    // Fallback: nếu không phải resend, gửi email thường với HTML được render thủ công nếu có
    const subject = overrides?.subject || '';
    const html = overrides?.html || '';
    const text = overrides?.text || '';
    return await sendEmail(to, subject, html, text, overrides?.from || null, emailSettings);
  }
  return await sendWithResendTemplate(to, templateIdOrAlias, variables, overrides, emailSettings);
}

/**
 * Kiểm tra kết nối email service
 */
async function verifyConnection() {
  try {
    switch (EMAIL_PROVIDER.toLowerCase()) {
      case 'resend':
        if (!process.env.RESEND_API_KEY) {
          throw new Error('RESEND_API_KEY chưa được cấu hình');
        }
        return { success: true, provider: 'resend' };
      
      case 'sendgrid':
        if (!process.env.SENDGRID_API_KEY) {
          throw new Error('SENDGRID_API_KEY chưa được cấu hình');
        }
        return { success: true, provider: 'sendgrid' };
      
      case 'mailgun':
        if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
          throw new Error('MAILGUN_API_KEY hoặc MAILGUN_DOMAIN chưa được cấu hình');
        }
        return { success: true, provider: 'mailgun' };
      
      case 'aws-ses':
      case 'awsses':
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
          throw new Error('AWS credentials chưa được cấu hình');
        }
        return { success: true, provider: 'aws-ses' };
      
      case 'nodemailer':
      case 'smtp':
      default:
        const nodemailer = require('nodemailer');
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
          throw new Error('EMAIL_USER hoặc EMAIL_PASS chưa được cấu hình');
        }
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true' || false,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        await transporter.verify();
        return { success: true, provider: 'nodemailer' };
    }
  } catch (error) {
    return { success: false, error: error.message, provider: EMAIL_PROVIDER };
  }
}

module.exports = {
  sendEmail,
  sendEmailTemplate,
  verifyConnection,
  EMAIL_PROVIDER
};

