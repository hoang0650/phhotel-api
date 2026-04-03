const mongoose = require('mongoose');

const debtSchema = new mongoose.Schema({
    // Thông tin khách sạn
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true
    },
    
    // Thông tin hóa đơn liên quan
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: true
    },
    invoiceNumber: {
        type: String,
        required: true
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
    guestInfo: {
        name: String,
        phone: String,
        email: String,
        idNumber: String,
        address: String,
        guestSource: String
    },
    
    // Thông tin nhân viên tạo công nợ
    createdByStaffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    createdByStaffName: {
        type: String
    },
    
    // Thông tin nhân viên quyết toán (nếu có)
    settledByStaffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
    },
    settledByStaffName: {
        type: String
    },
    
    // Số tiền công nợ
    debtAmount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Số tiền đã thanh toán
    paidAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Số tiền còn lại
    remainingAmount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Trạng thái công nợ
    status: {
        type: String,
        enum: ['pending', 'partial', 'settled', 'cancelled'],
        default: 'pending'
    },
    
    // Phương thức thanh toán khi quyết toán
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'card', 'credit_card', 'virtual_card', 'transfer', 'other']
    },
    
    // Thời gian
    debtDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    dueDate: {
        type: Date // Ngày đáo hạn (nếu có)
    },
    settledDate: {
        type: Date // Ngày quyết toán
    },
    
    // Ghi chú
    notes: {
        type: String
    },
    
    // Nhãn/Tag để phân loại công nợ
    labels: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        color: {
            type: String,
            default: 'default',
            trim: true
        }
    }],
    
    // Lịch sử thanh toán
    paymentHistory: [{
        paymentDate: {
            type: Date,
            default: Date.now
        },
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        paymentMethod: {
            type: String,
            enum: ['cash', 'bank_transfer', 'card', 'credit_card', 'virtual_card', 'transfer', 'other']
        },
        staffId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Staff'
        },
        staffName: {
            type: String
        },
        notes: {
            type: String
        }
    }],
    
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
debtSchema.index({ hotelId: 1, debtDate: -1 });
debtSchema.index({ invoiceId: 1 });
debtSchema.index({ customerId: 1 });
debtSchema.index({ status: 1 });
debtSchema.index({ roomId: 1 });

// Pre-save middleware để tự động tính remainingAmount
debtSchema.pre('save', function(next) {
    this.remainingAmount = this.debtAmount - this.paidAmount;
    
    // Tự động cập nhật status dựa trên số tiền đã thanh toán
    if (this.remainingAmount <= 0 && this.status !== 'settled') {
        this.status = 'settled';
        if (!this.settledDate) {
            this.settledDate = new Date();
        }
    } else if (this.paidAmount > 0 && this.remainingAmount > 0 && this.status === 'pending') {
        this.status = 'partial';
    }
    
    // Tự động cập nhật updatedAt
    this.updatedAt = Date.now();
    
    next();
});

const Debt = mongoose.model('Debt', debtSchema);
module.exports = { Debt };

