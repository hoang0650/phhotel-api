var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const nodemailer = require('nodemailer');
// const db = require('./db')
var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var roomsRouter = require('./routes/rooms');
var hotelsRouter = require('./routes/hotels');
var bookingsRouter = require('./routes/bookings')
var businessRouter = require('./routes/business')
var staffsRouter = require('./routes/staffs')
var emailsRouter = require('./routes/emails')
var chatsRouter = require('./routes/chat')
var chatboxRouter = require('./routes/chatbox');
var otaIntegrationsRouter = require('./routes/otaIntegrations');
var sepayRouter = require('./routes/sepay');
var bankHubRouter = require('./routes/bankHub');
var paypalRouter = require('./routes/paypal');
var cryptoRouter = require('./routes/crypto');
var shiftHandoverRouter = require('./routes/shiftHandover');
var servicesRouter = require('./routes/services');
var transactionsRouter = require('./routes/transactions');
var invoicesRouter = require('./routes/invoices');
var debtRouter = require('./routes/debt');
var tuyaRouter = require('./routes/tuya');
var aiAssistantRouter = require('./routes/aiAssistant');
var blogRouter = require('./routes/blog');
var commentRouter = require('./routes/comment');
var financialSummaryRouter = require('./routes/financialSummary');
var revenueRouter = require('./routes/revenue');
var filesRouter = require('./routes/files');
var sessionsRouter = require('./routes/sessions');
var contactRouter = require('./routes/contact');
var einvoiceRouter = require('./routes/einvoice');
var guestsRouter = require('./routes/guests');
const swaggerConfig = require('./swagger/swagger');
const jwt =require('jsonwebtoken')
const cors = require('cors');
const dotenv = require('dotenv');
const pricingRoutes = require('./routes/pricing');
const priceConfigRouter = require('./routes/priceConfig');
const settingsRouter = require('./routes/settings');
const roomCategoryRoutes = require('./routes/roomCategory');
const {mongooseSetup} = require('./config/db');
dotenv.config();

mongooseSetup();


//Middleware để xác thực token
function authentication(req,res,next){
  const token = req.header('Authorization')
  if(!token) return res.status(401).json({message:'Authorization'})
  jwt.verify(token, process.env.JWT_SECRET, (err,user)=>{
    if(err) return res.status(403).json({message:'Forbidden'})
    req.user = user
    next();
  })
}

// Middleware để kiểm tra role
const authorize = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).send('Forbidden');

    next();
  };
};

const transporter = nodemailer.createTransport({
  service: 'gmail', // hoặc dịch vụ email bạn chọn
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-email-password'
  }
});

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(cors({
  origin: (origin, callback) => {
    const whitelist = [
      'http://localhost:4200',
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://localhost:19006',
      'https://phhotel.vercel.app',
      'https://www.phhotel.vn',
      'https://phhotel.vn',
      'https://rork.com',
      'https://rork.com/p/rcmgljhz0n5okje2wjh3n',
      'https://flutlab.io',
      'https://preview.flutlab.io'
    ];
    const flutlabSubdomain = origin && /https?:\/\/([a-z0-9-]+\.)*flutlab\.io$/i.test(origin);
    if (!origin || whitelist.includes(origin) || flutlabSubdomain) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.options('*', cors());
app.use(logger('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Import maintenance mode middleware
const { checkMaintenanceMode } = require('./middlewares/auth');

// Public routes (không cần authentication và không bị block bởi maintenance mode)
app.use('/', indexRouter);
app.use('/users', usersRouter);

// Áp dụng maintenance mode check cho tất cả routes sau đây
// Lưu ý: Middleware này sẽ kiểm tra maintenance mode nhưng vẫn cho phép
// superadmin và admin truy cập, và cho phép các route public (login, signup, etc.)
app.use(checkMaintenanceMode);
app.use('/rooms', roomsRouter);
app.use('/hotels', hotelsRouter);
app.use('/bookings', bookingsRouter);
app.use('/businesses',businessRouter);
app.use('/staffs',staffsRouter);
app.use('/emails',emailsRouter);
app.use('/chats',chatsRouter);
app.use('/chatboxes',chatboxRouter);
app.use('/ota-integrations',otaIntegrationsRouter);
app.use('/sepay', sepayRouter);
app.use('/bankhub', bankHubRouter);
app.use('/paypal', paypalRouter);
app.use('/crypto', cryptoRouter);
app.use('/pricing-packages', pricingRoutes);
app.use('/priceConfig', priceConfigRouter);

// Webhook routes (không cần authentication)
const sepayController = require('./controllers/sepayController');
app.post('/hooks/sepay-payment', sepayController.handleWebhook);
app.use('/shift-handover', shiftHandoverRouter);
app.use('/services', servicesRouter);
app.use('/transactions', transactionsRouter);
app.use('/invoices', invoicesRouter);
app.use('/debts', debtRouter);
app.use('/tuya', tuyaRouter);
app.use('/ai-assistant', aiAssistantRouter);
app.use('/blogs', blogRouter);
app.use('/comments', commentRouter);
app.use('/financial-summary', financialSummaryRouter);
app.use('/revenue', revenueRouter);
app.use('/files', filesRouter);
app.use('/contacts', contactRouter);
app.use('/e-invoice', einvoiceRouter);
app.use('/guests', guestsRouter);
app.use('/sessions', sessionsRouter);
const { authenticateToken } = require('./middlewares/auth');
app.use('/api/settings', authenticateToken, settingsRouter);
app.use('/room-categories', roomCategoryRoutes);
// Swagger setup
app.use('/api-docs', swaggerConfig.swaggerUi.serve, swaggerConfig.swaggerUi.setup(swaggerConfig.swaggerDocs));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
