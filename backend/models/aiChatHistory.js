const mongoose = require('mongoose');

const aiChatHistorySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  hotelId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Hotel',
    index: true
  },
  businessId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Business',
    index: true
  },
  role: { 
    type: String, 
    enum: ['superadmin', 'admin', 'business', 'hotel', 'staff'],
    required: true
  },
  messages: [{
    role: { 
      type: String, 
      enum: ['user', 'assistant'], 
      required: true 
    },
    content: { 
      type: String, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    fileUrl: String,
    fileType: String
  }],
  context: {
    // Lưu trữ thông tin context để AI có thể hiểu phạm vi dữ liệu
    allowedHotels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel'
    }],
    allowedBusinesses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business'
    }],
    dataScope: {
      type: String,
      enum: ['all', 'business', 'hotel', 'none'],
      default: 'none'
    }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Index để tìm kiếm nhanh theo userId và hotelId
aiChatHistorySchema.index({ userId: 1, hotelId: 1 });
aiChatHistorySchema.index({ createdAt: -1 });

const AiChatHistory = mongoose.model('AiChatHistory', aiChatHistorySchema);

module.exports = { AiChatHistory };

