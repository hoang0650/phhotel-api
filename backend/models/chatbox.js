const mongoose = require('mongoose');

const chatboxSchema = new mongoose.Schema({
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isBotMessage: { type: Boolean, default: false }  // True nếu là tin nhắn từ bot
});

const Chatbox = mongoose.model('Chatbox', chatboxSchema);
module.exports = {Chatbox}