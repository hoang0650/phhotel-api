const { Comment } = require('../models/comment');
const { Blog } = require('../models/blog');
const mongoose = require('mongoose');

// ============ LẤY DANH SÁCH COMMENT ============

exports.getComments = async (req, res) => {
  try {
    const { blogId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!blogId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp blogId' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Lấy các comment gốc (không phải reply)
    const query = {
      blogId: blogId,
      parentCommentId: null,
      status: 'approved'
    };

    const total = await Comment.countDocuments(query);
    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'fullName username email')
      .lean();

    // Lấy replies cho mỗi comment
    const commentIds = comments.map(c => c._id);
    const replies = await Comment.find({
      parentCommentId: { $in: commentIds },
      status: 'approved'
    })
      .sort({ createdAt: 1 })
      .populate('userId', 'fullName username email')
      .lean();

    // Nhóm replies theo parentCommentId
    const repliesMap = new Map();
    replies.forEach(reply => {
      const parentId = reply.parentCommentId.toString();
      if (!repliesMap.has(parentId)) {
        repliesMap.set(parentId, []);
      }
      repliesMap.get(parentId).push(reply);
    });

    // Kiểm tra user đã like/dislike chưa
    const currentUser = req.user;
    const userId = currentUser ? currentUser._id.toString() : null;

    // Gắn replies vào comments
    const formattedComments = comments.map(comment => {
      const commentId = comment._id.toString();
      const userLiked = userId && comment.likes ? comment.likes.some(like => like.userId.toString() === userId) : false;
      const userDisliked = userId && comment.dislikes ? comment.dislikes.some(dislike => dislike.userId.toString() === userId) : false;
      
      // Format replies
      const formattedReplies = (repliesMap.get(commentId) || []).map((reply) => {
        const replyUserLiked = userId && reply.likes ? reply.likes.some((like) => like.userId.toString() === userId) : false;
        const replyUserDisliked = userId && reply.dislikes ? reply.dislikes.some((dislike) => dislike.userId.toString() === userId) : false;
        return {
          ...reply,
          likesCount: reply.likes ? reply.likes.length : 0,
          dislikesCount: reply.dislikes ? reply.dislikes.length : 0,
          userLiked: replyUserLiked,
          userDisliked: replyUserDisliked
        };
      });

      return {
        ...comment,
        replies: formattedReplies,
        likesCount: comment.likes ? comment.likes.length : 0,
        dislikesCount: comment.dislikes ? comment.dislikes.length : 0,
        userLiked: userLiked,
        userDisliked: userDisliked
      };
    });

    res.status(200).json({
      comments: formattedComments,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách comment', error: error.message });
  }
};

// ============ TẠO COMMENT ============

exports.createComment = async (req, res) => {
  try {
    const { blogId } = req.params;
    const { content, parentCommentId } = req.body;
    const currentUser = req.user;

    if (!blogId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp blogId' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập nội dung comment' });
    }

    // Kiểm tra blog có tồn tại không
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Nếu là reply, kiểm tra parent comment có tồn tại không
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ message: 'Không tìm thấy comment gốc' });
      }
      // Đảm bảo parent comment thuộc cùng blog
      if (parentComment.blogId.toString() !== blogId) {
        return res.status(400).json({ message: 'Comment gốc không thuộc bài viết này' });
      }
    }

    const commentData = {
      blogId: blogId,
      userId: currentUser._id,
      userName: currentUser.fullName || currentUser.username || 'Người dùng',
      userEmail: currentUser.email || '',
      userAvatar: currentUser.avatar || '',
      content: content.trim(),
      parentCommentId: parentCommentId || null,
      status: 'approved' // Tự động approve, có thể thay đổi sau
    };

    const newComment = new Comment(commentData);
    const savedComment = await newComment.save();

    // Populate để trả về đầy đủ thông tin
    const populatedComment = await Comment.findById(savedComment._id)
      .populate('userId', 'fullName username email')
      .lean();

    res.status(201).json({
      ...populatedComment,
      likesCount: 0,
      dislikesCount: 0,
      userLiked: false,
      userDisliked: false,
      replies: []
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(400).json({ message: 'Lỗi khi tạo comment', error: error.message });
  }
};

// ============ LIKE/DISLIKE COMMENT ============

exports.toggleLike = async (req, res) => {
  try {
    const { commentId } = req.params;
    const currentUser = req.user;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Không tìm thấy comment' });
    }

    const userId = currentUser._id;
    const likes = comment.likes || [];
    const dislikes = comment.dislikes || [];

    // Kiểm tra user đã like chưa
    const userLikedIndex = likes.findIndex(like => like.userId.toString() === userId.toString());
    const userDislikedIndex = dislikes.findIndex(dislike => dislike.userId.toString() === userId.toString());

    let action = 'none'; // 'liked', 'disliked', 'removed', 'none'

    if (userLikedIndex !== -1) {
      // Đã like, bỏ like
      comment.likes.splice(userLikedIndex, 1);
      action = 'removed';
    } else if (userDislikedIndex !== -1) {
      // Đang dislike, chuyển sang like (bỏ dislike, thêm like)
      comment.dislikes.splice(userDislikedIndex, 1);
      comment.likes.push({ userId, createdAt: new Date() });
      action = 'liked';
    } else {
      // Chưa like/dislike, thêm like
      comment.likes.push({ userId, createdAt: new Date() });
      action = 'liked';
    }

    await comment.save();

    res.status(200).json({
      message: action === 'liked' ? 'Đã thích comment' : action === 'removed' ? 'Đã bỏ thích' : 'Đã chuyển sang thích',
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
      userLiked: action === 'liked',
      userDisliked: false
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: 'Lỗi khi thích comment', error: error.message });
  }
};

exports.toggleDislike = async (req, res) => {
  try {
    const { commentId } = req.params;
    const currentUser = req.user;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Không tìm thấy comment' });
    }

    const userId = currentUser._id;
    const likes = comment.likes || [];
    const dislikes = comment.dislikes || [];

    // Kiểm tra user đã dislike chưa
    const userDislikedIndex = dislikes.findIndex(dislike => dislike.userId.toString() === userId.toString());
    const userLikedIndex = likes.findIndex(like => like.userId.toString() === userId.toString());

    let action = 'none';

    if (userDislikedIndex !== -1) {
      // Đã dislike, bỏ dislike
      comment.dislikes.splice(userDislikedIndex, 1);
      action = 'removed';
    } else if (userLikedIndex !== -1) {
      // Đang like, chuyển sang dislike (bỏ like, thêm dislike)
      comment.likes.splice(userLikedIndex, 1);
      comment.dislikes.push({ userId, createdAt: new Date() });
      action = 'disliked';
    } else {
      // Chưa like/dislike, thêm dislike
      comment.dislikes.push({ userId, createdAt: new Date() });
      action = 'disliked';
    }

    await comment.save();

    res.status(200).json({
      message: action === 'disliked' ? 'Đã không thích comment' : action === 'removed' ? 'Đã bỏ không thích' : 'Đã chuyển sang không thích',
      likesCount: comment.likes.length,
      dislikesCount: comment.dislikes.length,
      userLiked: false,
      userDisliked: action === 'disliked'
    });
  } catch (error) {
    console.error('Error toggling dislike:', error);
    res.status(500).json({ message: 'Lỗi khi không thích comment', error: error.message });
  }
};

// ============ XÓA COMMENT ============

exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const currentUser = req.user;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Không tìm thấy comment' });
    }

    // Chỉ cho phép xóa comment của chính mình hoặc superadmin
    if (comment.userId.toString() !== currentUser._id.toString() && 
        currentUser.role !== 'superadmin') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa comment này' });
    }

    // Xóa comment và tất cả replies
    await Comment.deleteMany({
      $or: [
        { _id: commentId },
        { parentCommentId: commentId }
      ]
    });

    res.status(200).json({ message: 'Đã xóa comment thành công' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ message: 'Lỗi khi xóa comment', error: error.message });
  }
};

