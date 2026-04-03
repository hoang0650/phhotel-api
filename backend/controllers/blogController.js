const { Blog } = require('../models/blog');
const mongoose = require('mongoose');

// ============ LẤY DANH SÁCH BLOG ============

exports.getBlogs = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Chỉ superadmin và admin mới được xem
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập' });
    }

    const { page = 1, limit = 10, search, status, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    // Lọc theo status
    if (status && status !== 'all') {
      query.status = status;
    }

    // Lọc theo category
    if (category) {
      query.category = category;
    }

    // Tìm kiếm
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('authorId', 'fullName username email')
      .lean();

    // Format authorName từ populated authorId
    const formattedBlogs = blogs.map(blog => ({
      ...blog,
      authorName: blog.authorId?.fullName || blog.authorId?.username || blog.authorName || 'N/A',
      authorId: blog.authorId?._id || blog.authorId
    }));

    res.status(200).json({
      blogs: formattedBlogs,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting blogs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách blog', error: error.message });
  }
};

// ============ LẤY BLOG THEO ID ============

exports.getBlogById = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Chỉ superadmin và admin mới được xem
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập' });
    }

    const blog = await Blog.findById(req.params.id)
      .populate('authorId', 'fullName username email')
      .lean();

    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Format authorName
    blog.authorName = blog.authorId?.fullName || blog.authorId?.username || blog.authorName || 'N/A';
    blog.authorId = blog.authorId?._id || blog.authorId;

    res.status(200).json(blog);
  } catch (error) {
    console.error('Error getting blog by id:', error);
    res.status(500).json({ message: 'Lỗi khi lấy bài viết', error: error.message });
  }
};

// ============ TẠO BLOG MỚI ============

exports.createBlog = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Chỉ superadmin và admin mới được tạo
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền tạo bài viết' });
    }

    const { title, content, excerpt, status, featuredImage, tags, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Vui lòng cung cấp tiêu đề và nội dung' });
    }

    // Xử lý tags nếu là string (phân cách bằng dấu phẩy)
    let tagsArray = [];
    if (tags) {
      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    const blogData = {
      title,
      content,
      excerpt: excerpt || '',
      authorId: currentUser._id,
      authorName: currentUser.fullName || currentUser.username || 'Admin',
      status: status || 'draft',
      featuredImage: featuredImage || '',
      tags: tagsArray,
      category: category || '',
      views: 0
    };

    const newBlog = new Blog(blogData);
    const savedBlog = await newBlog.save();

    res.status(201).json(savedBlog);
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(400).json({ message: 'Lỗi khi tạo bài viết', error: error.message });
  }
};

// ============ CẬP NHẬT BLOG ============

exports.updateBlog = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Chỉ superadmin và admin mới được cập nhật
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật bài viết' });
    }

    const { id } = req.params;
    const { title, content, excerpt, status, featuredImage, tags, category } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    // Xử lý tags nếu là string
    let tagsArray = blog.tags || [];
    if (tags !== undefined) {
      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
        tagsArray = tags;
      }
    }

    // Cập nhật các trường
    if (title !== undefined) blog.title = title;
    if (content !== undefined) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (status !== undefined) blog.status = status;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (tags !== undefined) blog.tags = tagsArray;
    if (category !== undefined) blog.category = category;
    
    blog.updatedAt = new Date();

    const updatedBlog = await blog.save();

    res.status(200).json(updatedBlog);
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(400).json({ message: 'Lỗi khi cập nhật bài viết', error: error.message });
  }
};

// ============ PUBLIC API (KHÔNG CẦN AUTHENTICATION) ============

// Lấy danh sách blog công khai (chỉ published)
exports.getPublicBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { status: 'published' }; // Chỉ lấy bài viết đã publish

    // Lọc theo category
    if (category) {
      query.category = category;
    }

    // Tìm kiếm
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Blog.countDocuments(query);
    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('authorId', 'fullName username email')
      .lean();

    // Format authorName từ populated authorId
    const formattedBlogs = blogs.map(blog => ({
      ...blog,
      authorName: blog.authorId?.fullName || blog.authorId?.username || blog.authorName || 'N/A',
      authorId: blog.authorId?._id || blog.authorId
    }));

    res.status(200).json({
      blogs: formattedBlogs,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting public blogs:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách blog', error: error.message });
  }
};

// Lấy blog công khai theo ID
exports.getPublicBlogById = async (req, res) => {
  try {
    const currentUser = req.user;
    const blog = await Blog.findOne({ 
      _id: req.params.id,
      status: 'published' // Chỉ lấy bài viết đã publish
    })
      .populate('authorId', 'fullName username email')
      .lean();

    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết hoặc bài viết chưa được xuất bản' });
    }

    // Format authorName
    blog.authorName = blog.authorId?.fullName || blog.authorId?.username || blog.authorName || 'N/A';
    blog.authorId = blog.authorId?._id || blog.authorId;

    // Tính likesCount và dislikesCount
    blog.likesCount = blog.likes ? blog.likes.length : 0;
    blog.dislikesCount = blog.dislikes ? blog.dislikes.length : 0;

    // Kiểm tra user đã like/dislike chưa
    if (currentUser) {
      const userId = currentUser._id.toString();
      blog.userLiked = blog.likes ? blog.likes.some(like => like.userId.toString() === userId) : false;
      blog.userDisliked = blog.dislikes ? blog.dislikes.some(dislike => dislike.userId.toString() === userId) : false;
    } else {
      blog.userLiked = false;
      blog.userDisliked = false;
    }

    res.status(200).json(blog);
  } catch (error) {
    console.error('Error getting public blog by id:', error);
    res.status(500).json({ message: 'Lỗi khi lấy bài viết', error: error.message });
  }
};

// Tăng lượt xem
exports.incrementViews = async (req, res) => {
  try {
    const { id } = req.params;
    
    const blog = await Blog.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    res.status(200).json({ views: blog.views });
  } catch (error) {
    console.error('Error incrementing views:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật lượt xem', error: error.message });
  }
};

// Like blog
exports.likeBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    if (blog.status !== 'published') {
      return res.status(403).json({ message: 'Bài viết chưa được xuất bản' });
    }

    const userId = currentUser._id;
    const likes = blog.likes || [];
    const dislikes = blog.dislikes || [];

    // Kiểm tra user đã like chưa
    const userLikedIndex = likes.findIndex(like => like.userId.toString() === userId.toString());
    const userDislikedIndex = dislikes.findIndex(dislike => dislike.userId.toString() === userId.toString());

    if (userLikedIndex !== -1) {
      // Đã like, bỏ like
      blog.likes.splice(userLikedIndex, 1);
    } else if (userDislikedIndex !== -1) {
      // Đang dislike, chuyển sang like
      blog.dislikes.splice(userDislikedIndex, 1);
      blog.likes.push({ userId, createdAt: new Date() });
    } else {
      // Chưa like/dislike, thêm like
      blog.likes.push({ userId, createdAt: new Date() });
    }

    await blog.save();

    res.status(200).json({
      likesCount: blog.likes.length,
      dislikesCount: blog.dislikes.length,
      userLiked: blog.likes.some(like => like.userId.toString() === userId.toString()),
      userDisliked: blog.dislikes.some(dislike => dislike.userId.toString() === userId.toString())
    });
  } catch (error) {
    console.error('Error liking blog:', error);
    res.status(500).json({ message: 'Lỗi khi thích bài viết', error: error.message });
  }
};

// Dislike blog
exports.dislikeBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (!currentUser) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập' });
    }

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    if (blog.status !== 'published') {
      return res.status(403).json({ message: 'Bài viết chưa được xuất bản' });
    }

    const userId = currentUser._id;
    const likes = blog.likes || [];
    const dislikes = blog.dislikes || [];

    // Kiểm tra user đã dislike chưa
    const userDislikedIndex = dislikes.findIndex(dislike => dislike.userId.toString() === userId.toString());
    const userLikedIndex = likes.findIndex(like => like.userId.toString() === userId.toString());

    if (userDislikedIndex !== -1) {
      // Đã dislike, bỏ dislike
      blog.dislikes.splice(userDislikedIndex, 1);
    } else if (userLikedIndex !== -1) {
      // Đang like, chuyển sang dislike
      blog.likes.splice(userLikedIndex, 1);
      blog.dislikes.push({ userId, createdAt: new Date() });
    } else {
      // Chưa like/dislike, thêm dislike
      blog.dislikes.push({ userId, createdAt: new Date() });
    }

    await blog.save();

    res.status(200).json({
      likesCount: blog.likes.length,
      dislikesCount: blog.dislikes.length,
      userLiked: blog.likes.some(like => like.userId.toString() === userId.toString()),
      userDisliked: blog.dislikes.some(dislike => dislike.userId.toString() === userId.toString())
    });
  } catch (error) {
    console.error('Error disliking blog:', error);
    res.status(500).json({ message: 'Lỗi khi không thích bài viết', error: error.message });
  }
};

// ============ XÓA BLOG ============

exports.deleteBlog = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Chỉ superadmin mới được xóa
    if (currentUser.role !== 'superadmin') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa bài viết. Chỉ superadmin mới có quyền này.' });
    }

    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: 'Không tìm thấy bài viết' });
    }

    await Blog.findByIdAndDelete(id);

    res.status(200).json({ message: 'Đã xóa bài viết thành công' });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ message: 'Lỗi khi xóa bài viết', error: error.message });
  }
};

