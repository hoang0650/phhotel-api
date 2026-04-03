const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.SchemaTypes.ObjectId, 
        ref: 'User', 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['system', 'booking', 'payment', 'maintenance', 'staff', 'guest'],
        required: true 
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    priority: { 
        type: String, 
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium' 
    },
    action: {
        type: { 
            type: String, 
            enum: ['link', 'button'] 
        },
        text: String,
        url: String
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date,
    metadata: Object
});

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = { Notification }; 