const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
    bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking' },
    guestId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
    shiftHandoverId: { type: mongoose.SchemaTypes.ObjectId, ref: 'ShiftHandover' },
    
    // Loại giao dịch mở rộng
    type: { 
        type: String, 
        enum: [
            'payment',           // Thanh toán
            'refund',            // Hoàn tiền
            'deposit',           // Đặt cọc
            'charge',            // Phụ thu
            'expense',           // Phiếu chi
            'income',            // Phiếu thu
            'shift_handover',    // Giao ca
            'manager_handover',  // Giao tiền quản lý
            'service',           // Dịch vụ
            'adjustment'         // Điều chỉnh
        ],
        required: true 
    },
    
    // Phân loại chi tiết hơn cho phiếu chi
    expenseCategory: {
        type: String,
        enum: [
            'supplies',          // Vật tư
            'utilities',         // Tiện ích (điện, nước)
            'salary',            // Lương
            'maintenance',       // Bảo trì
            'marketing',         // Marketing
            'other'              // Khác
        ]
    },
    
    // Phân loại chi tiết hơn cho phiếu thu
    incomeCategory: {
        type: String,
        enum: [
            'room',              // Thu phòng
            'rental',            // Thuê phòng (tương tự room)
            'service',           // Thu dịch vụ
            'deposit',           // Thu cọc
            'penalty',           // Thu phạt
            'other'              // Khác
        ]
    },
    
    amount: { type: Number, required: true },
    currency: { type: String, default: 'VND' },
    
    // Phương thức thanh toán mở rộng
    method: { 
        type: String, 
        enum: ['cash', 'credit_card', 'bank_transfer', 'card', 'virtual_card', 'other'],
        required: true 
    },
    
    status: { 
        type: String, 
        enum: ['pending', 'completed', 'failed', 'cancelled', 'approved', 'rejected'],
        default: 'pending' 
    },
    
    reference: String,
    invoiceNumber: String,
    receiptNumber: String,
    
    details: {
        cardLast4: String,
        cardType: String,
        bankName: String,
        accountNumber: String,
        receiptNumber: String,
        // Chi tiết cho giao ca
        fromStaffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
        toStaffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
        previousAmount: Number,
        newAmount: Number,
        difference: Number
    },
    
    description: String,
    notes: String,
    
    // Người xử lý
    processedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    processedAt: Date,
    
    // Người phê duyệt (cho phiếu chi cần phê duyệt)
    approvedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    approvedAt: Date,
    
    // Đính kèm (hóa đơn, biên lai)
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

// Index cho tìm kiếm nhanh
transactionSchema.index({ hotelId: 1, type: 1, createdAt: -1 });
transactionSchema.index({ hotelId: 1, staffId: 1, createdAt: -1 });
transactionSchema.index({ hotelId: 1, method: 1, createdAt: -1 });

transactionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = { Transaction };
