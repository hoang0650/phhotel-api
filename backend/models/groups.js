const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const groupSchema = new mongoose.Schema({
  name: String,
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  hotelId: { type: Schema.Types.ObjectId, ref: 'Hotel' }
});

const Group = mongoose.model('Group', groupSchema);
module.exports = {Group}