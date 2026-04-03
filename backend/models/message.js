const mongoose = require('mongoose');
const MessageSchema = new mongoose.Schema({
  // senderId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
  // receiverId: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
  // groupId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Group' },
  // chatType: { type: String, enum: ['private', 'group'], default: 'private' },
  // text: String,
  // imageUrl: String,
  // message: { type: String, required: true },
  // timestamp: { type: Date, default: Date.now }
  sender: { type: String, required: true },    // User ID của người gửi
  message: { type: String, required: true },   // Nội dung tin nhắn
  roomId: { type: String, required: true },    // ID của room hoặc cặp người chat
  type: { type: String, enum: ['group', 'private'], default: 'private' },  // Loại chat (group hoặc private)
  createdAt: { type: Date, default: Date.now }, // Thời gian tin nhắn
});

const Message = mongoose.model('Message', MessageSchema);
module.exports = { Message }