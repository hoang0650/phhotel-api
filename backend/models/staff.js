const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
    userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
    personalInfo: {
        firstName: String,
        lastName: String,
        dateOfBirth: Date,
        gender: String,
        nationality: String,
        idType: String,
        idNumber: String,
        idExpiryDate: Date,
        idScanUrl: String
    },
    contactInfo: {
        email: String,
        phone: String,
        emergencyContact: {
            name: String,
            relationship: String,
            phone: String
        },
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            postalCode: String
        }
    },
    employmentInfo: {
        position: { 
            type: String, 
            enum: ['manager', 'receptionist', 'housekeeper', 'maintenance', 'other'],
            required: true 
        },
        department: String,
        startDate: Date,
        endDate: Date,
        status: { 
            type: String, 
            enum: ['active', 'on_leave', 'terminated'],
            default: 'active'
        },
        salary: Number,
        allowance: { type: Number, default: 0 }, // Phụ cấp
        insurance: { type: Number, default: 0 }, // Bảo hiểm
        penalty: { type: Number, default: 0 }, // Phạt
        bonus: { type: Number, default: 0 }, // Thưởng
        advancePayment: { type: Number, default: 0 }, // Ứng lương
        bankAccount: {
            bankName: String,
            accountNumber: String,
            accountName: String
        },
        taxId: String
    },
    schedule: [
        {
            date: Date,
            shift: { 
                type: String, 
                enum: ['morning', 'afternoon', 'night', 'full-day'] 
            },
            startTime: String,
            endTime: String,
            status: { 
                type: String, 
                enum: ['scheduled', 'completed', 'absent', 'late'] 
            }
        }
    ],
    attendance: [
        {
            date: Date,
            checkIn: Date,
            checkOut: Date,
            hoursWorked: Number,
            overtime: Number,
            status: { 
                type: String, 
                enum: ['present', 'absent', 'late', 'leave'] 
            }
        }
    ],
    leaves: [
        {
            startDate: Date,
            endDate: Date,
            type: { 
                type: String, 
                enum: ['annual', 'sick', 'personal', 'unpaid'] 
            },
            status: { 
                type: String, 
                enum: ['pending', 'approved', 'rejected'] 
            },
            reason: String,
            approvedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' }
        }
    ],
    payroll: [
        {
            period: {
                startDate: Date,
                endDate: Date
            },
            baseSalary: Number,
            daysWorked: Number, // Số ngày thực làm
            allowance: { type: Number, default: 0 }, // Phụ cấp
            insurance: { type: Number, default: 0 }, // Bảo hiểm
            penalty: { type: Number, default: 0 }, // Phạt
            bonus: { type: Number, default: 0 }, // Thưởng
            advancePayment: { type: Number, default: 0 }, // Ứng lương
            overtime: Number,
            bonuses: Number,
            deductions: Number,
            netSalary: Number,
            paymentDate: Date,
            paymentStatus: { 
                type: String, 
                enum: ['pending', 'paid'] 
            },
            paymentReference: String,
            calculatedAt: { type: Date, default: Date.now } // Thời gian tính lương
        }
    ],
    permissions: {
        type: [{
            type: String,
            enum: ['view', 'create', 'edit', 'delete', 'manage_rooms', 'manage_bookings']
        }],
        default: ['view']
    },
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

staffSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Staff = mongoose.model('Staff', staffSchema);
module.exports = { Staff }