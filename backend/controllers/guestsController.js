const { Guest } = require('../models/guests');
const { Hotel } = require('../models/hotel');
const { Room } = require('../models/rooms');
const mongoose = require('mongoose');

// Lấy danh sách khách - với phân quyền
exports.getGuests = async (req, res) => {
  try {
    const currentUser = req.user;
    const { hotelId, search, page = 1, limit = 20, guestType } = req.query;
    
    const query = {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Phân quyền theo role
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
      // Admin thấy tất cả
      if (hotelId) query.hotelId = hotelId;
    } else if (currentUser.role === 'business') {
      // Business chỉ thấy khách của hotels thuộc business mình
      if (!currentUser.businessId) {
        return res.status(403).json({ message: 'Bạn không có quyền xem khách' });
      }
      
      const hotels = await Hotel.find({ businessId: currentUser.businessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      
      if (hotelIds.length === 0) {
        return res.status(200).json({ guests: [], total: 0 });
      }
      
      if (hotelId) {
        const hotelIdStr = hotelId.toString();
        const isAuthorized = hotelIds.some(id => id.toString() === hotelIdStr);
        if (isAuthorized) {
          query.hotelId = mongoose.Types.ObjectId.isValid(hotelId) ? new mongoose.Types.ObjectId(hotelId) : hotelId;
        } else {
          return res.status(403).json({ message: 'Bạn không có quyền xem khách của khách sạn này' });
        }
      } else {
        query.hotelId = { $in: hotelIds };
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      // Hotel/staff chỉ thấy khách của hotel mình
      if (currentUser.hotelId) {
        query.hotelId = currentUser.hotelId;
      } else {
        return res.status(200).json({ guests: [], total: 0 });
      }
    } else {
      return res.status(200).json({ guests: [], total: 0 });
    }
    
    // Tìm kiếm theo tên, số CMND/CCCD, số điện thoại
    if (search) {
      query.$or = [
        { 'personalInfo.fullName': { $regex: search, $options: 'i' } },
        { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
        { 'personalInfo.idNumber': { $regex: search, $options: 'i' } },
        { 'contactInfo.phone': { $regex: search, $options: 'i' } },
        { 'contactInfo.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Lọc theo loại khách
    if (guestType) {
      query.guestType = guestType;
    }
    
    const guests = await Guest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('hotelId', 'name')
      .populate('businessId', 'name');
    
    const total = await Guest.countDocuments(query);
    
    res.status(200).json({ guests, total });
  } catch (error) {
    console.error('Error getting guests:', error);
    res.status(500).json({ message: error.message });
  }
};

// Lấy thông tin khách theo ID
exports.getGuestById = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    
    const guest = await Guest.findById(id)
      .populate('hotelId', 'name')
      .populate('businessId', 'name');
    
    if (!guest) {
      return res.status(404).json({ message: 'Không tìm thấy khách' });
    }
    
    // Kiểm tra quyền
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(guest.hotelId);
      if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem khách này' });
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      if (guest.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem khách này' });
      }
    }
    
    res.status(200).json(guest);
  } catch (error) {
    console.error('Error getting guest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Tạo khách mới
exports.createGuest = async (req, res) => {
  try {
    const currentUser = req.user;
    const {
      hotelId,
      guestType,
      personalInfo,
      contactInfo,
      preferences,
      notes
    } = req.body;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp hotelId' });
    }
    
    // Kiểm tra quyền
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    }
    
    // Kiểm tra quyền tạo khách
    if (currentUser.role === 'business') {
      const hotelBusinessId = hotel.businessId?.toString();
      if (hotelBusinessId !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo khách cho khách sạn này' });
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      if (hotelId !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo khách cho khách sạn này' });
      }
    }
    
    // Tạo fullName từ firstName và lastName
    const fullName = personalInfo?.firstName && personalInfo?.lastName
      ? `${personalInfo.firstName} ${personalInfo.lastName}`.trim()
      : personalInfo?.fullName || '';
    
    const guestData = {
      hotelId,
      businessId: hotel.businessId,
      guestType: guestType || 'regular',
      personalInfo: {
        ...personalInfo,
        fullName
      },
      contactInfo: contactInfo || {},
      preferences: preferences || {},
      notes: notes || ''
    };
    
    const guest = new Guest(guestData);
    await guest.save();
    
    const populatedGuest = await Guest.findById(guest._id)
      .populate('hotelId', 'name')
      .populate('businessId', 'name');
    
    res.status(201).json({ message: 'Tạo khách thành công', guest: populatedGuest });
  } catch (error) {
    console.error('Error creating guest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật thông tin khách
exports.updateGuest = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const {
      guestType,
      personalInfo,
      contactInfo,
      preferences,
      notes
    } = req.body;
    
    const guest = await Guest.findById(id);
    if (!guest) {
      return res.status(404).json({ message: 'Không tìm thấy khách' });
    }
    
    // Kiểm tra quyền
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(guest.hotelId);
      if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa khách này' });
      }
    } else if (currentUser.role === 'hotel') {
      if (guest.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa khách này' });
      }
    } else if (currentUser.role === 'staff') {
      // Staff không có quyền chỉnh sửa
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa khách' });
    }
    
    // Cập nhật thông tin
    if (guestType !== undefined) guest.guestType = guestType;
    if (personalInfo) {
      // Tạo fullName nếu có firstName và lastName
      if (personalInfo.firstName && personalInfo.lastName) {
        personalInfo.fullName = `${personalInfo.firstName} ${personalInfo.lastName}`.trim();
      } else if (personalInfo.fullName) {
        // Nếu chỉ có fullName, giữ nguyên
      }
      guest.personalInfo = { ...guest.personalInfo, ...personalInfo };
    }
    if (contactInfo) guest.contactInfo = { ...guest.contactInfo, ...contactInfo };
    if (preferences) guest.preferences = { ...guest.preferences, ...preferences };
    if (notes !== undefined) guest.notes = notes;
    
    guest.updatedAt = Date.now();
    await guest.save();
    
    const populatedGuest = await Guest.findById(guest._id)
      .populate('hotelId', 'name')
      .populate('businessId', 'name');
    
    res.status(200).json({ message: 'Cập nhật khách thành công', guest: populatedGuest });
  } catch (error) {
    console.error('Error updating guest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Xóa khách
exports.deleteGuest = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    
    const guest = await Guest.findById(id);
    if (!guest) {
      return res.status(404).json({ message: 'Không tìm thấy khách' });
    }
    
    // Kiểm tra quyền - chỉ business và hotel manager mới có quyền xóa
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(guest.hotelId);
      if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa khách này' });
      }
    } else if (currentUser.role === 'hotel') {
      if (guest.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa khách này' });
      }
    } else {
      return res.status(403).json({ message: 'Bạn không có quyền xóa khách' });
    }
    
    await Guest.findByIdAndDelete(id);
    
    res.status(200).json({ message: 'Xóa khách thành công' });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Tạo booking cho khách (đặt phòng trước)
exports.createBookingForGuest = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params; // guestId từ URL
    const { roomId, checkInDate, checkOutDate, rateType, advancePayment, notes, adults, children } = req.body;
    
    if (!roomId || !checkInDate) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin: roomId, checkInDate' });
    }
    
    const guest = await Guest.findById(id);
    if (!guest) {
      return res.status(404).json({ message: 'Không tìm thấy khách' });
    }
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    const guestHotelId = typeof guest.hotelId === 'object' ? guest.hotelId._id : guest.hotelId;
    
    // Kiểm tra quyền
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(guestHotelId);
      if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo booking cho khách này' });
      }
      if (room.hotelId?.toString() !== guestHotelId?.toString()) {
        return res.status(400).json({ message: 'Phòng và khách phải cùng khách sạn' });
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      if (guestHotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo booking cho khách này' });
      }
      if (room.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(400).json({ message: 'Phòng và khách phải cùng khách sạn' });
      }
    }
    
    // Tạo guestInfo từ thông tin khách
    const guestInfo = {
      name: guest.personalInfo?.fullName || `${guest.personalInfo?.firstName || ''} ${guest.personalInfo?.lastName || ''}`.trim(),
      idNumber: guest.personalInfo?.idNumber || '',
      phone: guest.contactInfo?.phone || '',
      email: guest.contactInfo?.email || '',
      address: guest.contactInfo?.address ? 
        `${guest.contactInfo.address.street || ''}, ${guest.contactInfo.address.city || ''}, ${guest.contactInfo.address.country || ''}`.trim() : '',
      guestSource: 'regular'
    };
    
    // Gọi API đặt phòng từ rooms controller
    const { createRoomBooking } = require('./rooms');
    const bookingReq = {
      body: {
        roomId,
        hotelId: guestHotelId,
        guestInfo,
        checkInDate,
        checkOutDate,
        rateType: rateType || 'hourly',
        advancePayment: advancePayment || 0,
        notes: notes || '',
        adults: adults || 1,
        children: children || 0
      },
      user: currentUser
    };
    
    // Tạo booking response object để chuyển tiếp response
    let bookingResponse = null;
    const bookingRes = {
      status: (code) => ({
        json: (data) => {
          bookingResponse = { code, data };
        }
      })
    };
    
    await createRoomBooking(bookingReq, bookingRes);
    
    if (bookingResponse && (bookingResponse.code === 200 || bookingResponse.code === 201)) {
      res.status(200).json({
        message: 'Đặt phòng thành công',
        booking: bookingResponse.data,
        guest: guest
      });
    } else if (bookingResponse) {
      res.status(bookingResponse.code).json(bookingResponse.data);
    } else {
      res.status(500).json({ message: 'Lỗi khi tạo booking' });
    }
  } catch (error) {
    console.error('Error creating booking for guest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Assign khách vào phòng (không tự động check-in, tạo booking hiện tại)
exports.assignGuestToRoom = async (req, res) => {
  try {
    const currentUser = req.user;
    const { guestId, roomId, checkInTime, rateType, guestInfo } = req.body;
    
    if (!guestId || !roomId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp guestId và roomId' });
    }
    
    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({ message: 'Không tìm thấy khách' });
    }
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra quyền
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(guest.hotelId);
      if (!hotel || hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền assign khách này' });
      }
      if (room.hotelId?.toString() !== guest.hotelId?.toString()) {
        return res.status(400).json({ message: 'Phòng và khách phải cùng khách sạn' });
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      if (guest.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền assign khách này' });
      }
      if (room.hotelId?.toString() !== currentUser.hotelId?.toString()) {
        return res.status(400).json({ message: 'Phòng và khách phải cùng khách sạn' });
      }
    }
    
    // Kiểm tra phòng có đang trống không
    if (room.status === 'occupied') {
      return res.status(400).json({ message: 'Phòng đang có khách' });
    }
    
    // Tạo guestInfo từ thông tin khách nếu không truyền lên
    const guestInfoForAssign = guestInfo || {
      name: guest.personalInfo?.fullName || `${guest.personalInfo?.firstName || ''} ${guest.personalInfo?.lastName || ''}`.trim(),
      idNumber: guest.personalInfo?.idNumber || '',
      phone: guest.contactInfo?.phone || '',
      email: guest.contactInfo?.email || '',
      address: guest.contactInfo?.address ? 
        `${guest.contactInfo.address.street || ''}, ${guest.contactInfo.address.city || ''}, ${guest.contactInfo.address.country || ''}`.trim() : '',
      guestSource: 'regular' // Khách từ danh sách khách
    };
    
    // Thực hiện tạo booking hiện tại (không check-in) bằng rooms controller
    const { createRoomBooking } = require('./rooms');
    const guestHotelId = typeof guest.hotelId === 'object' ? guest.hotelId._id : guest.hotelId;
    
    const bookingReq = {
      body: {
        roomId,
        hotelId: guestHotelId,
        guestInfo: guestInfoForAssign,
        checkInDate: checkInTime || new Date(),
        checkOutDate: null,
        rateType: rateType || 'hourly',
        advancePayment: 0,
        notes: 'Assign từ Guest Management'
      },
      user: currentUser
    };
    
    let bookingResponse = null;
    const bookingRes = {
      status: (code) => ({
        json: (data) => {
          bookingResponse = { code, data };
        }
      })
    };
    
    await createRoomBooking(bookingReq, bookingRes);
    
    if (bookingResponse && (bookingResponse.code === 200 || bookingResponse.code === 201)) {
      return res.status(200).json({
        message: 'Assign khách vào phòng thành công (đã tạo booking)',
        ...bookingResponse.data
      });
    } else if (bookingResponse) {
      return res.status(bookingResponse.code).json(bookingResponse.data);
    } else {
      return res.status(500).json({ message: 'Lỗi khi assign khách vào phòng' });
    }
  } catch (error) {
    console.error('Error assigning guest to room:', error);
    res.status(500).json({ message: error.message });
  }
};
