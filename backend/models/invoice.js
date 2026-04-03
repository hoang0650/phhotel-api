const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    // Thông tin hóa đơn
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    
    // Thông tin khách sạn và business
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true
    },
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business'
    },
    
    // Thông tin phòng
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room'
    },
    roomNumber: {
        type: String,
        required: true
    },
    roomType: {
        type: String
    },
    
    // Thông tin booking (nếu có)
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    
    // Thông tin khách hàng
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String
    },
    customerEmail: {
        type: String
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    guestDetails: {
        name: String,
        phone: String,
        email: String,
        idNumber: String,
        address: String,
        guestSource: {
            type: String,
            enum: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other'],
            default: 'walkin'
        }
    },
    guestInfo: {
        name: String,
        phone: String,
        email: String,
        idNumber: String,
        address: String,
        guestSource: {
            type: String,
            enum: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other'],
            default: 'walkin'
        }
    },
    guestSource: {
        type: String,
        enum: ['walkin', 'booking', 'agoda', 'traveloka', 'expedia', 'trip', 'g2j', 'other'],
        default: 'walkin'
    },
    
    // Thông tin nhân viên
    staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    staffName: {
        type: String
    },
    
    // Thời gian check-in/check-out
    checkInTime: {
        type: Date,
        required: true
    },
    checkOutTime: {
        type: Date,
        required: true
    },
    duration: {
        hours: { type: Number, default: 0 },
        days: { type: Number, default: 0 }
    },
    
    rateType: {
        type: String,
        enum: ['hourly', 'daily', 'nightly', 'weekly', 'monthly'],
        default: 'hourly'
    },
    
    // Sản phẩm/dịch vụ
    products: [{
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, default: 1 },
        totalPrice: { type: Number }, // Tổng giá = price * quantity
        description: String
    }],
    services: [{
        serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
        serviceName: String,
        price: Number,
        quantity: { type: Number, default: 1 },
        totalPrice: Number,
        orderTime: Date
    }],
    
    // Thông tin tài chính
    roomAmount: {
        type: Number,
        required: true,
        default: 0
    },
    roomTotal: {
        type: Number,
        default: 0
    },
    roomPrice: {
        type: Number,
        default: 0
    },
    serviceAmount: {
        type: Number,
        default: 0
    },
    servicesTotal: {
        type: Number,
        default: 0
    },
    remainingAmount: {
        type: Number,
        default: 0
    },
    additionalCharges: {
        type: Number,
        default: 0
    },
    discount: {
        type: Number,
        default: 0
    },
    advancePayment: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    
    // Phương thức thanh toán
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'card', 'credit_card', 'virtual_card', 'transfer', 'other'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'partial', 'refunded', 'cancelled', 'completed'],
        default: 'paid'
    },
    paymentTransactionId: String, // ID giao dịch thanh toán (nếu có, từ SePay)
    
    // Thông tin hóa đơn điện tử (Sepay eInvoice)
    einvoiceTrackingCode: String, // Tracking code khi tạo hóa đơn
    einvoiceIssueTrackingCode: String, // Tracking code khi phát hành hóa đơn
    einvoiceReferenceCode: String, // Reference code của hóa đơn điện tử
    einvoiceUserId: String, // User ID đã tạo hóa đơn (để lấy đúng token khi check status)
    einvoiceStatus: {
        type: String,
        enum: ['creating', 'created', 'issuing', 'issued', 'failed', 'issue_failed'],
        default: null
    },
    einvoiceUrl: String, // URL xem hóa đơn điện tử
    einvoicePdfUrl: String, // URL tải PDF hóa đơn điện tử
    einvoiceData: {
        type: mongoose.Schema.Types.Mixed // Lưu toàn bộ dữ liệu từ Sepay API
    },
    
    // Ghi chú
    notes: {
        type: String
    },
    
    // Thông tin business (lưu trữ để không cần query lại)
    businessInfo: {
        name: String,
        legalName: String,
        taxId: String,
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String
        },
        contactInfo: {
            email: String,
            phone: String,
            website: String
        },
        logo: String
    },
    
    // Trạng thái
    status: {
        type: String,
        enum: ['draft', 'issued', 'paid', 'cancelled', 'refunded'],
        default: 'issued'
    },
    
    // Ngày tạo và cập nhật
    issuedDate: {
        type: Date,
        default: Date.now
    },
    paidDate: Date,
    
    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index cho tìm kiếm nhanh
invoiceSchema.index({ hotelId: 1, issuedDate: -1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ roomId: 1, checkOutTime: -1 });
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ bookingId: 1 });

// Pre-save middleware để tự động tạo invoiceNumber nếu chưa có
invoiceSchema.pre('save', async function(next) {
    if (!this.invoiceNumber) {
        // Tạo invoice number: INV-YYYYMMDD-HHMMSS-XXXX
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.invoiceNumber = `INV-${dateStr}-${timeStr}-${random}`;
    }
    
    // Tự động cập nhật updatedAt
    this.updatedAt = Date.now();
    
    next();
});

const Invoice = mongoose.model('Invoice', invoiceSchema);
module.exports = { Invoice };

