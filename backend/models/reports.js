const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    businessId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Business', required: true },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel' },
    type: { 
        type: String, 
        enum: ['occupancy', 'revenue', 'staff', 'guest', 'custom'],
        required: true
    },
    name: { type: String, required: true },
    description: String,
    parameters: {
        startDate: Date,
        endDate: Date,
        filters: Object,
        groupBy: String
    },
    data: Object,
    format: { 
        type: String, 
        enum: ['json', 'csv', 'pdf'],
        default: 'json'
    },
    fileUrl: String,
    createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    metadata: Object
});

reportSchema.index({ businessId: 1 });
reportSchema.index({ hotelId: 1 });
reportSchema.index({ type: 1 });
reportSchema.index({ createdAt: 1 });

const Report = mongoose.model('Report', reportSchema);
module.exports = { Report }; 