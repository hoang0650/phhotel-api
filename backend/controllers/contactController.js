const { Contact } = require('../models/contact');

// Tạo liên hệ mới (public - không cần auth)
const createContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        error: 'Vui lòng điền đầy đủ thông tin: tên, email, chủ đề và nội dung' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    const contact = new Contact({
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : '',
      subject: subject.trim(),
      message: message.trim(),
      status: 'pending'
    });

    await contact.save();

    // Tạo thông báo cho admin/superadmin về liên hệ mới
    try {
        const { Settings } = require('../models/settings');
        const mongoose = require('mongoose');
        let settings = await Settings.findOne();
        
        if (!settings) {
            settings = new Settings();
        }
        
        const announcementId = new mongoose.Types.ObjectId().toString();
        const contactAnnouncement = {
            id: announcementId,
            type: 'info',
            title: `Liên hệ mới từ: ${contact.name}`,
            message: `${contact.name} (${contact.email}) đã gửi liên hệ với chủ đề: "${contact.subject}". Nội dung: ${contact.message.substring(0, 100)}${contact.message.length > 100 ? '...' : ''}`,
            priority: 'medium',
            startDate: new Date(),
            isActive: true,
            targetRoles: ['superadmin', 'admin'], // Chỉ gửi cho superadmin và admin
            targetType: 'system',
            notificationType: 'contact',
            createdAt: new Date()
        };
        
        if (!settings.announcements) {
            settings.announcements = [];
        }
        
        settings.announcements.push(contactAnnouncement);
        await settings.save();
    } catch (announcementError) {
        console.error('Error creating contact announcement:', announcementError);
        // Không throw error để không ảnh hưởng đến việc tạo contact
    }

    res.status(201).json({
      message: 'Gửi liên hệ thành công. Chúng tôi sẽ phản hồi sớm nhất có thể.',
      contact: {
        _id: contact._id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        createdAt: contact.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Lỗi khi gửi liên hệ. Vui lòng thử lại sau.' });
  }
};

// Lấy danh sách liên hệ (chỉ admin và superadmin)
const getContacts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      startDate,
      endDate
    } = req.query;

    const query = {};

    // Filter by status
    if (status && ['pending', 'read', 'replied', 'archived'].includes(status)) {
      query.status = status;
    }

    // Search by name, email, subject, or message
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .populate('repliedBy', 'username email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Contact.countDocuments(query)
    ]);

    res.status(200).json({
      contacts,
      total,
      page: parseInt(page),
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách liên hệ' });
  }
};

// Lấy chi tiết một liên hệ (chỉ admin và superadmin)
const getContactById = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findById(id)
      .populate('repliedBy', 'username email fullName')
      .lean();

    if (!contact) {
      return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    }

    // Nếu chưa đọc, đánh dấu là đã đọc
    if (contact.status === 'pending') {
      await Contact.findByIdAndUpdate(id, { status: 'read' });
      contact.status = 'read';
    }

    res.status(200).json({ contact });
  } catch (error) {
    console.error('Error getting contact by id:', error);
    res.status(500).json({ error: 'Lỗi khi lấy thông tin liên hệ' });
  }
};

// Cập nhật trạng thái liên hệ (chỉ admin và superadmin)
const updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user?.userId;

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    }

    if (status && ['pending', 'read', 'replied', 'archived'].includes(status)) {
      contact.status = status;
      
      if (status === 'replied' && userId) {
        contact.repliedAt = new Date();
        contact.repliedBy = userId;
      }
    }

    if (notes !== undefined) {
      contact.notes = notes;
    }

    await contact.save();

    res.status(200).json({
      message: 'Cập nhật trạng thái liên hệ thành công',
      contact
    });
  } catch (error) {
    console.error('Error updating contact status:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái liên hệ' });
  }
};

// Trả lời liên hệ (chỉ admin và superadmin)
const replyContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { replyMessage } = req.body;
    const userId = req.user?.userId;

    if (!replyMessage || !replyMessage.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung phản hồi' });
    }

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    }

    contact.status = 'replied';
    contact.repliedAt = new Date();
    contact.repliedBy = userId;
    contact.replyMessage = replyMessage.trim();

    await contact.save();

    res.status(200).json({
      message: 'Phản hồi liên hệ thành công',
      contact
    });
  } catch (error) {
    console.error('Error replying contact:', error);
    res.status(500).json({ error: 'Lỗi khi phản hồi liên hệ' });
  }
};

// Xóa liên hệ (chỉ admin và superadmin)
const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByIdAndDelete(id);
    if (!contact) {
      return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    }

    res.status(200).json({ message: 'Xóa liên hệ thành công' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Lỗi khi xóa liên hệ' });
  }
};

// Lấy thống kê liên hệ (chỉ admin và superadmin)
const getContactStats = async (req, res) => {
  try {
    const stats = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsObj = {
      total: 0,
      pending: 0,
      read: 0,
      replied: 0,
      archived: 0
    };

    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
      statsObj.total += stat.count;
    });

    res.status(200).json({ stats: statsObj });
  } catch (error) {
    console.error('Error getting contact stats:', error);
    res.status(500).json({ error: 'Lỗi khi lấy thống kê liên hệ' });
  }
};

module.exports = {
  createContact,
  getContacts,
  getContactById,
  updateContactStatus,
  replyContact,
  deleteContact,
  getContactStats
};

