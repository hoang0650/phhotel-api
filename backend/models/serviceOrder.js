const mongoose = require('mongoose');

const serviceOrderSchema = new mongoose.Schema({
    bookingId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Booking', required: true },
    roomId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Room', required: true },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel', required: true },
    customerId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
    staffId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Staff' },
    orderTime: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['pending', 'processing', 'delivered', 'cancelled'], 
        default: 'pending' 
    },
    items: [{
        serviceId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Service', required: true },
        name: String,
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true },
        total: { type: Number, required: true },
        note: String
    }],
    totalAmount: { type: Number, required: true },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'refunded', 'included_in_room_charge'], 
        default: 'pending' 
    },
    paymentMethod: { 
        type: String, 
        enum: ['cash', 'credit_card', 'room_charge', 'banking', 'other'], 
        default: 'room_charge' 
    },
    note: String,
    deliveryTime: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

serviceOrderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const ServiceOrder = mongoose.model('ServiceOrder', serviceOrderSchema);
module.exports = { ServiceOrder }; 