const mongoose = require('mongoose');

const aiInteractionSchema = new mongoose.Schema({
    businessId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Business', required: true },
    hotelId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Hotel' },
    userId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    query: { type: String, required: true },
    response: { type: String, required: true },
    context: Object,
    timestamp: { type: Date, default: Date.now },
    feedback: {
        rating: Number,
        comment: String
    },
    metadata: Object
});

aiInteractionSchema.index({ businessId: 1 });
aiInteractionSchema.index({ hotelId: 1 });
aiInteractionSchema.index({ userId: 1 });
aiInteractionSchema.index({ timestamp: 1 });

const AiInteraction = mongoose.model('AiInteraction', aiInteractionSchema);
module.exports = { AiInteraction }; 