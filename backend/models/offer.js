const mongoose = require('mongoose')

const offerSchema = new mongoose.Schema({
    title: String,
    description: String,
    discount: Number,
    validFrom: Date,
    validTo: Date,
    customers: [{ type: mongoose.SchemaTypes.ObjectId, ref: 'User' }]
});

const Offer = mongoose.model('Offer', offerSchema);
module.exports = {Offer}