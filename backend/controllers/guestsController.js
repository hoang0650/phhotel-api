const { Guest } = require('../models/guests');
const { Hotel } = require('../models/hotel');
const { Room } = require('../models/rooms');
const RoomEvent = require('../models/roomEvent');
const mongoose = require('mongoose');
const { getCache, setCache, generateCacheKey } = require('../config/cacheHelper');

const AI_LABEL_TTL = 60;
const AI_STATS_TTL = 5 * 60;

function isAiAuthorized(req) {
  const required = process.env.AI_INTERNAL_TOKEN;
  if (!required) return true;
  const token = req.headers['x-ai-token'];
  return token && token === required;
}

async function computeGuestLabel({ hotelId, guestId, idNumber }) {
  if (!hotelId) return null;

  let guest = null;
  if (guestId && mongoose.Types.ObjectId.isValid(guestId)) {
    guest = await Guest.findById(guestId).lean();
  } else if (idNumber) {
    guest = await Guest.findOne({ hotelId, 'personalInfo.idNumber': idNumber }).lean();
  }
  if (!guest) return null;

  const resolvedIdNumber = guest?.personalInfo?.idNumber || idNumber || '';
  const isReturning = guest.guestType === 'frequent' || (Array.isArray(guest.stayHistory) && guest.stayHistory.length > 0);

  let currentStay = null;
  if (resolvedIdNumber) {
    const occupiedRoom = await Room.findOne({
      hotelId,
      status: 'occupied',
      'currentBooking.guestInfo.idNumber': resolvedIdNumber
    }).select('_id roomNumber').lean();

    if (occupiedRoom) {
      const lastCheckin = await RoomEvent.findOne({
        hotelId,
        roomId: occupiedRoom._id,
        type: 'checkin',
        'guestInfo.idNumber': resolvedIdNumber
      }).sort({ createdAt: -1 }).lean();

      const checkinAt = lastCheckin?.checkinTime || lastCheckin?.createdAt || null;
      if (checkinAt) {
        const startedAt = new Date(checkinAt);
        const now = new Date();
        const durationSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
        currentStay = {
          roomId: String(occupiedRoom._id),
          roomNumber: occupiedRoom.roomNumber,
          startedAt: startedAt.toISOString(),
          durationSeconds
        };
      }
    }
  }

  return {
    guestId: String(guest._id),
    hotelId: String(hotelId),
    fullName: guest?.personalInfo?.fullName || '',
    idNumber: resolvedIdNumber,
    guestType: guest.guestType || 'regular',
    isReturning,
    loyaltyTier: guest.loyaltyTier || 'standard',
    currentStay
  };
}

exports.computeGuestLabel = computeGuestLabel;

async function computeHotelGuestRoomStats(hotelId, period) {
  const normalizedPeriod = String(period || 'day');
  if (!['day', 'week', 'month'].includes(normalizedPeriod)) {
    throw new Error('Invalid period');
  }

  const cacheKey = generateCacheKey('ai:stats', String(hotelId), normalizedPeriod);
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const now = new Date();
  const start = new Date(now);
  if (normalizedPeriod === 'day') {
    start.setDate(start.getDate() - 30);
  } else if (normalizedPeriod === 'week') {
    start.setDate(start.getDate() - 7 * 12);
  } else {
    start.setMonth(start.getMonth() - 12);
  }

  const events = await RoomEvent.find({
    hotelId,
    type: 'checkin',
    createdAt: { $gte: start }
  }).select('createdAt roomId guestInfo.idNumber').lean();

  const idNumbers = Array.from(new Set(events.map(e => e?.guestInfo?.idNumber).filter(Boolean)));
  let firstCheckins = [];
  if (idNumbers.length > 0) {
    firstCheckins = await RoomEvent.aggregate([
      { $match: { hotelId: mongoose.Types.ObjectId.isValid(hotelId) ? new mongoose.Types.ObjectId(hotelId) : hotelId, type: 'checkin', 'guestInfo.idNumber': { $in: idNumbers } } },
      { $group: { _id: '$guestInfo.idNumber', firstAt: { $min: '$createdAt' } } }
    ]);
  }
  const firstMap = new Map(firstCheckins.map(x => [x._id, new Date(x.firstAt).getTime()]));

  const buckets = new Map();
  const toKey = (d) => {
    const dt = new Date(d);
    if (normalizedPeriod === 'day') {
      return dt.toISOString().slice(0, 10);
    }
    if (normalizedPeriod === 'month') {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const date = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  for (const ev of events) {
    const key = toKey(ev.createdAt);
    if (!buckets.has(key)) {
      buckets.set(key, { period: key, totalStays: 0, roomsUsed: new Set(), uniqueGuests: new Set(), returningStays: 0, uniqueReturningGuests: new Set() });
    }
    const b = buckets.get(key);
    b.totalStays += 1;
    if (ev.roomId) b.roomsUsed.add(String(ev.roomId));
    const idn = ev?.guestInfo?.idNumber;
    if (idn) {
      b.uniqueGuests.add(idn);
      const firstAtMs = firstMap.get(idn);
      const evMs = new Date(ev.createdAt).getTime();
      if (firstAtMs !== undefined && firstAtMs < evMs) {
        b.returningStays += 1;
        b.uniqueReturningGuests.add(idn);
      }
    }
  }

  const points = Array.from(buckets.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(b => ({
      period: b.period,
      totalStays: b.totalStays,
      roomsUsed: b.roomsUsed.size,
      uniqueGuests: b.uniqueGuests.size,
      returningStays: b.returningStays,
      uniqueReturningGuests: b.uniqueReturningGuests.size
    }));

  const payload = { hotelId: String(hotelId), period: normalizedPeriod, from: start.toISOString(), to: now.toISOString(), points };
  await setCache(cacheKey, payload, AI_STATS_TTL);
  return payload;
}

exports.computeHotelGuestRoomStats = computeHotelGuestRoomStats;

exports.matchFaceEncodingForAi = async (req, res) => {
  try {
    if (!isAiAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { hotelId, encoding, threshold } = req.body || {};
    if (!hotelId) {
      return res.status(400).json({ message: 'Missing hotelId' });
    }
    if (!Array.isArray(encoding) || encoding.length === 0) {
      return res.status(400).json({ message: 'Missing encoding' });
    }

    const tol = typeof threshold === 'number' ? threshold : 0.5;
    const cacheKey = generateCacheKey('ai:face-db', String(hotelId));
    let faceDb = await getCache(cacheKey);
    if (!Array.isArray(faceDb)) {
      const docs = await Guest.find({
        hotelId,
        'metadata.faceEncoding': { $type: 'array', $ne: [] }
      }).select('_id metadata.faceEncoding').lean();
      faceDb = docs.map(d => ({ guestId: String(d._id), encoding: d?.metadata?.faceEncoding || [] }));
      await setCache(cacheKey, faceDb, AI_STATS_TTL);
    }

    let bestId = null;
    let bestDistSq = Infinity;
    for (const item of faceDb) {
      const enc = item?.encoding;
      if (!Array.isArray(enc) || enc.length !== encoding.length) continue;
      let distSq = 0;
      for (let i = 0; i < enc.length; i++) {
        const a = Number(enc[i]);
        const b = Number(encoding[i]);
        if (Number.isNaN(a) || Number.isNaN(b)) {
          distSq = Infinity;
          break;
        }
        const diff = a - b;
        distSq += diff * diff;
      }
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = item.guestId;
      }
    }

    const bestDist = Number.isFinite(bestDistSq) ? Math.sqrt(bestDistSq) : null;
    if (bestId && bestDist !== null && bestDist <= tol) {
      return res.status(200).json({ found: true, guestId: bestId, distance: bestDist });
    }
    return res.status(200).json({ found: false });
  } catch (error) {
    console.error('Error matchFaceEncodingForAi:', error);
    return res.status(500).json({ message: error.message });
  }
};

exports.getHotelGuestRoomStatsForDashboard = async (req, res) => {
  try {
    const currentUser = req.user;
    const { hotelId, period } = req.query;
    if (!hotelId) {
      return res.status(400).json({ message: 'Missing hotelId' });
    }

    if (currentUser?.role === 'business') {
      if (!currentUser.businessId) {
        return res.status(403).json({ message: 'Bạn không có quyền xem thống kê' });
      }
      const hotel = await Hotel.findById(hotelId).select('businessId').lean();
      if (!hotel || String(hotel.businessId || '') !== String(currentUser.businessId || '')) {
        return res.status(403).json({ message: 'Bạn không có quyền xem thống kê khách sạn này' });
      }
    } else if (currentUser?.role === 'hotel' || currentUser?.role === 'staff') {
      if (String(currentUser.hotelId || '') !== String(hotelId || '')) {
        return res.status(403).json({ message: 'Bạn không có quyền xem thống kê khách sạn này' });
      }
    }

    const payload = await computeHotelGuestRoomStats(hotelId, period);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Error getHotelGuestRoomStatsForDashboard:', error);
    return res.status(500).json({ message: error.message });
  }
};

exports.getGuestLabelForAi = async (req, res) => {
  try {
    if (!isAiAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { hotelId, guestId, idNumber } = req.query;
    if (!hotelId) {
      return res.status(400).json({ message: 'Missing hotelId' });
    }

    const cacheKey = generateCacheKey('ai:guest-label', String(hotelId), String(guestId || ''), String(idNumber || ''));
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const label = await computeGuestLabel({ hotelId, guestId, idNumber });
    const payload = { found: !!label, label };
    await setCache(cacheKey, payload, AI_LABEL_TTL);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Error getGuestLabelForAi:', error);
    return res.status(500).json({ message: error.message });
  }
};

exports.getHotelGuestRoomStatsForAi = async (req, res) => {
  try {
    if (!isAiAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { hotelId, period } = req.query;
    if (!hotelId) {
      return res.status(400).json({ message: 'Missing hotelId' });
    }
    const payload = await computeHotelGuestRoomStats(hotelId, period);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Error getHotelGuestRoomStatsForAi:', error);
    return res.status(500).json({ message: error.message });
  }
};

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
