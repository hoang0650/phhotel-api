const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const commentSchema = new Schema({
  blogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Blog',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  userEmail: {
    type: String
  },
  userAvatar: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null // null nếu là comment gốc, có giá trị nếu là reply
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  dislikes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index để tìm kiếm nhanh
commentSchema.index({ blogId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1 });

// Pre-save middleware
commentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual để lấy số lượng likes và dislikes
commentSchema.virtual('likesCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

commentSchema.virtual('dislikesCount').get(function() {
  return this.dislikes ? this.dislikes.length : 0;
});

// Virtual để lấy replies
commentSchema.virtual('replies', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentCommentId'
});

const Comment = mongoose.model('Comment', commentSchema);
module.exports = { Comment };

