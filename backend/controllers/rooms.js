const { Room } = require("../models/rooms");
const { Hotel } = require("../models/hotel");
const { PriceConfig } = require("../models/priceConfig");
const { calculateRoomPriceHelper } = require("./priceConfig");
const { Service } = require("../models/service");
const { ServiceOrder } = require("../models/serviceOrder");
const { Booking } = require("../models/booking");
const { Invoice } = require("../models/invoice");
const { Debt } = require("../models/debt");
const RoomEvent = require("../models/roomEvent");
const { Transaction } = require("../models/transactions");
const { Settings } = require("../models/settings");
const { User } = require("../models/users");
const mongoose = require('mongoose');
const { deleteCachePattern } = require('../config/cacheHelper');

// Helper function để tạo Date theo timezone được chỉ định
// timezone: 'UTC+7', 'UTC+8', etc. (mặc định UTC+7)
function getTimeByTimezone(timezone = 'UTC+7') {
  const now = new Date();
  
  // Parse timezone offset (ví dụ: 'UTC+7' -> 7, 'UTC-5' -> -5)
  const timezoneMatch = timezone.match(/UTC([+-])(\d+)/);
  if (!timezoneMatch) {
    // Nếu không parse được, mặc định UTC+7
    timezone = 'UTC+7';
    const defaultMatch = timezone.match(/UTC([+-])(\d+)/);
    if (defaultMatch) {
      const sign = defaultMatch[1] === '+' ? 1 : -1;
      const hours = parseInt(defaultMatch[2]);
      const offset = sign * hours * 60 * 60 * 1000; // offset in milliseconds
      const localOffset = now.getTimezoneOffset() * 60000; // local offset in milliseconds
      return new Date(now.getTime() + localOffset + offset);
    }
  } else {
    const sign = timezoneMatch[1] === '+' ? 1 : -1;
    const hours = parseInt(timezoneMatch[2]);
    const offset = sign * hours * 60 * 60 * 1000; // offset in milliseconds
    const localOffset = now.getTimezoneOffset() * 60000; // local offset in milliseconds
    return new Date(now.getTime() + localOffset + offset);
  }
  
  // Fallback: trả về thời gian hiện tại
  return new Date();
}

// Helper function để tạo Date theo UTC+7 (múi giờ Việt Nam) - giữ lại để backward compatibility
function getUTCTimePlus7() {
  return getTimeByTimezone('UTC+7');
}

// Helper function để lấy timezone từ room hoặc hotel
function getTimezoneFromRoom(room) {
  // Ưu tiên lấy từ room.priceSettings.timezone
  if (room && room.priceSettings && room.priceSettings.timezone) {
    return room.priceSettings.timezone;
  }
  // Fallback: UTC+7
  return 'UTC+7';
}

function mapRoomPaymentMethod(method) {
  const m = (method || 'cash').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'card' || m === 'credit_card' || m === 'virtual_card' || m === 'visa') return 'card';
  if (m === 'bank_transfer' || m === 'transfer' || m === 'banking') return 'transfer';
  return 'cash';
}

function mapTransactionMethodFromRoomPaymentMethod(normalizedRoomMethod) {
  const m = (normalizedRoomMethod || 'cash').toLowerCase();
  if (m === 'transfer' || m === 'bank_transfer') return 'bank_transfer';
  if (m === 'card' || m === 'credit_card' || m === 'virtual_card') return 'card';
  return 'cash';
}

async function getHotelOrBusinessQRCode(hotelDoc) {
  if (!hotelDoc) return null;
  let result = null;
  if (hotelDoc.businessId) {
    const businessOwner = await User.findOne({
      role: 'business',
      businessId: hotelDoc.businessId,
      status: { $ne: 'deleted' }
    });
    if (businessOwner && businessOwner.bankAccount && businessOwner.bankAccount.qrPaymentUrl) {
      return {
        qrPaymentUrl: businessOwner.bankAccount.qrPaymentUrl,
        beneficiaryName: businessOwner.bankAccount.beneficiaryName || businessOwner.bankAccount.accountHolderName || '',
        bankName: businessOwner.bankAccount.bankName || '',
        accountNumber: businessOwner.bankAccount.accountNumber || '',
        source: 'business'
      };
    }
    const adminUser = await User.findOne({
      role: 'admin',
      businessId: hotelDoc.businessId,
      status: { $ne: 'deleted' }
    });
    if (adminUser && adminUser.bankAccount && adminUser.bankAccount.qrPaymentUrl) {
      return {
        qrPaymentUrl: adminUser.bankAccount.qrPaymentUrl,
        beneficiaryName: adminUser.bankAccount.beneficiaryName || adminUser.bankAccount.accountHolderName || '',
        bankName: adminUser.bankAccount.bankName || '',
        accountNumber: adminUser.bankAccount.accountNumber || '',
        source: 'admin'
      };
    }
  }
  const hotelManager = await User.findOne({
    role: 'hotel',
    hotelId: hotelDoc._id,
    status: { $ne: 'deleted' }
  });
  if (hotelManager && hotelManager.bankAccount && hotelManager.bankAccount.qrPaymentUrl) {
    return {
      qrPaymentUrl: hotelManager.bankAccount.qrPaymentUrl,
      beneficiaryName: hotelManager.bankAccount.beneficiaryName || hotelManager.bankAccount.accountHolderName || '',
      bankName: hotelManager.bankAccount.bankName || '',
      accountNumber: hotelManager.bankAccount.accountNumber || '',
      source: 'hotel_manager'
    };
  }
  if (hotelDoc.bankAccount && hotelDoc.bankAccount.qrPaymentUrl) {
    return {
      qrPaymentUrl: hotelDoc.bankAccount.qrPaymentUrl,
      beneficiaryName: hotelDoc.bankAccount.beneficiaryName || hotelDoc.bankAccount.accountHolderName || '',
      bankName: hotelDoc.bankAccount.bankName || '',
      accountNumber: hotelDoc.bankAccount.accountNumber || '',
      source: 'hotel'
    };
  }
  const systemSettings = await Settings.findOne();
  const paymentSettings = systemSettings?.paymentSettings || systemSettings?.bankAccount;
  const qrUrl = paymentSettings?.qrPaymentUrl || '';
  if (qrUrl) {
    return {
      qrPaymentUrl: qrUrl,
      beneficiaryName: paymentSettings?.beneficiaryName || paymentSettings?.accountHolderName || '',
      bankName: paymentSettings?.bankName || '',
      accountNumber: paymentSettings?.accountNumber || '',
      source: 'settings'
    };
  }
  return null;
}

// Helper function để tạo announcement tự động khi có sự kiện checkin, checkout, booking, cancellation
async function createAutoAnnouncement(notificationType, hotelId, roomId, roomNumber, guestName, additionalInfo = {}) {
  try {
    // Kiểm tra notification settings để xem có bật thông báo tương ứng không
    const hotel = await Hotel.findById(hotelId).lean();
    if (!hotel) return;
    
    // Lấy notification settings từ hotel hoặc system
    let notificationSettings = null;
    if (hotel.settings && hotel.settings.notificationSettings) {
      notificationSettings = hotel.settings.notificationSettings;
    } else {
      // Lấy từ system settings
      const settings = await Settings.findOne().lean();
      if (settings && settings.notificationSettings) {
        notificationSettings = settings.notificationSettings;
      }
    }
    
    // Kiểm tra xem có bật thông báo tương ứng không
    const notificationTypeMap = {
      'booking': 'notifyOnBooking',
      'checkin': 'notifyOnCheckin',
      'checkout': 'notifyOnCheckout',
      'cancellation': 'notifyOnCancellation',
      'maintenance': 'notifyOnMaintenance',
      'transfer': 'notifyOnTransfer',
      'systemError': 'notifyOnSystemError',
      'lowInventory': 'notifyOnLowInventory'
    };
    
    const notifyOnKey = notificationTypeMap[notificationType];
    if (!notifyOnKey) return; // Không có mapping, không tạo thông báo
    
    // Kiểm tra xem có bật thông báo không (mặc định true nếu không có settings)
    const isNotificationEnabled = notificationSettings ? (notificationSettings[notifyOnKey] !== false) : true;
    if (!isNotificationEnabled) return; // Không bật, không tạo thông báo
    
    // Kiểm tra xem có bật thông báo trong system settings không
    const systemSettings = await Settings.findOne().lean();
    const isSystemNotificationEnabled = systemSettings?.notificationSettings ? 
      (systemSettings.notificationSettings[notifyOnKey] !== false) : true;
    
    // Kiểm tra xem có bật thông báo trong hotel settings không
    const isHotelNotificationEnabled = hotel.settings?.notificationSettings ? 
      (hotel.settings.notificationSettings[notifyOnKey] !== false) : true;
    
    // Kiểm tra xem có bật hotelNotificationFeature trong package subscription không
    let hasPackageFeature = false;
    try {
      // Tìm user có role hotel hoặc business liên quan đến hotel này
      const { User } = require('../models/users');
      const PricingPackage = require('../models/pricingPackage');
      
      // Tìm hotel manager của hotel này
      const hotelManager = await User.findOne({ 
        hotelId: hotelId,
        role: 'hotel'
      }).populate('pricingPackage').lean();
      
      // Nếu không tìm thấy hotel manager, tìm business owner
      let userWithPackage = hotelManager;
      if (!userWithPackage && businessId) {
        userWithPackage = await User.findOne({
          businessId: businessId,
          role: 'business'
        }).populate('pricingPackage').lean();
      }
      
      // Kiểm tra package feature
      if (userWithPackage && userWithPackage.pricingPackage) {
        const packageData = userWithPackage.pricingPackage;
        // Kiểm tra package có hotelNotificationFeature không
        hasPackageFeature = packageData.hotelNotificationFeature === true;
        
        // Kiểm tra package còn hạn không
        if (userWithPackage.packageExpiryDate) {
          const expiryDate = new Date(userWithPackage.packageExpiryDate);
          if (expiryDate < new Date()) {
            hasPackageFeature = false; // Package đã hết hạn
          }
        }
      }
    } catch (packageError) {
      console.error('[createAutoAnnouncement] Error checking package feature:', packageError);
      // Nếu có lỗi, không chặn việc tạo thông báo
    }
    
    // Chỉ tạo thông báo nếu:
    // 1. Có bật trong system settings HOẶC
    // 2. Có bật trong hotel settings HOẶC  
    // 3. Có bật hotelNotificationFeature trong package
    const canCreateNotification = isSystemNotificationEnabled || 
                                  isHotelNotificationEnabled || 
                                  hasPackageFeature;
    
    if (!canCreateNotification) {
      console.log(`[createAutoAnnouncement] Skipping notification for ${notificationType} - no permission`);
      return; // Không có quyền, không tạo thông báo
    }
    
    // Lấy businessId từ hotel với xử lý đúng các format
    let businessId = null;
    if (hotel.businessId) {
      if (typeof hotel.businessId === 'string') {
        businessId = hotel.businessId;
      } else if (hotel.businessId instanceof mongoose.Types.ObjectId) {
        businessId = hotel.businessId;
      } else if (hotel.businessId._id) {
        businessId = hotel.businessId._id;
      } else if (hotel.businessId.toString) {
        businessId = hotel.businessId.toString();
      }
    }
    
    // Tạo title và message dựa trên notificationType
    let title = '';
    let message = '';
    
    switch (notificationType) {
      case 'checkin':
        title = `Check-in: Phòng ${roomNumber}`;
        message = `Khách ${guestName || 'lẻ'} đã check-in vào phòng ${roomNumber}${additionalInfo.checkinTime ? ' lúc ' + new Date(additionalInfo.checkinTime).toLocaleString('vi-VN') : ''}.`;
        break;
      case 'checkout':
        title = `Check-out: Phòng ${roomNumber}`;
        message = `Khách ${guestName || 'lẻ'} đã check-out khỏi phòng ${roomNumber}${additionalInfo.checkoutTime ? ' lúc ' + new Date(additionalInfo.checkoutTime).toLocaleString('vi-VN') : ''}.`;
        if (additionalInfo.totalAmount) {
          message += ` Tổng tiền: ${additionalInfo.totalAmount.toLocaleString('vi-VN')} VNĐ.`;
        }
        break;
      case 'booking':
        title = `Đặt phòng: Phòng ${roomNumber}`;
        message = `Có đặt phòng mới cho phòng ${roomNumber}${additionalInfo.checkInDate ? ' từ ' + new Date(additionalInfo.checkInDate).toLocaleString('vi-VN') : ''}${additionalInfo.checkOutDate ? ' đến ' + new Date(additionalInfo.checkOutDate).toLocaleString('vi-VN') : ''}.`;
        if (guestName) {
          message += ` Khách: ${guestName}.`;
        }
        break;
      case 'cancellation':
        title = `Hủy đặt phòng: Phòng ${roomNumber}`;
        message = `Đặt phòng cho phòng ${roomNumber} đã bị hủy${additionalInfo.reason ? '. Lý do: ' + additionalInfo.reason : '.'}`;
        if (guestName) {
          message += ` Khách: ${guestName}.`;
        }
        break;
      case 'systemError':
        title = `Lỗi hệ thống: ${additionalInfo.errorTitle || 'Lỗi không xác định'}`;
        message = additionalInfo.errorMessage || 'Đã xảy ra lỗi trong hệ thống.';
        break;
      case 'lowInventory':
        title = `Hết hàng: ${additionalInfo.itemName || 'Sản phẩm'}`;
        message = `${additionalInfo.itemName || 'Sản phẩm'} đã hết hàng${additionalInfo.currentStock !== undefined ? ' (Tồn kho: ' + additionalInfo.currentStock + ')' : ''}.`;
        break;
      case 'maintenance':
        title = `Dọn phòng: Phòng ${roomNumber}`;
        const maintenanceType = additionalInfo.isCompleted ? 'hoàn thành' : 'bắt đầu';
        message = `Phòng ${roomNumber} đã ${maintenanceType} ${additionalInfo.isCompleted ? 'dọn dẹp/bảo trì' : 'báo bẩn/bảo trì'}${additionalInfo.notes ? '. Ghi chú: ' + additionalInfo.notes : ''}.`;
        break;
      case 'transfer':
        title = `Chuyển phòng: ${additionalInfo.fromRoom || 'N/A'} → ${additionalInfo.toRoom || 'N/A'}`;
        message = `Khách ${guestName || 'lẻ'} đã được chuyển từ phòng ${additionalInfo.fromRoom || 'N/A'} sang phòng ${additionalInfo.toRoom || 'N/A'}.`;
        break;
      default:
        return; // Không tạo thông báo cho loại không xác định
    }
    
    // Lấy settings document
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    
    // Tạo announcement ID
    const announcementId = new mongoose.Types.ObjectId().toString();
    
    // Xác định targetType và targetHotels/targetBusinesses
    let targetType = 'system';
    let targetHotelsIds = [];
    let targetBusinessesIds = [];
    
    // Convert businessId sang ObjectId nếu cần
    let businessIdObj = null;
    if (businessId) {
      if (typeof businessId === 'string') {
        businessIdObj = new mongoose.Types.ObjectId(businessId);
      } else if (businessId instanceof mongoose.Types.ObjectId) {
        businessIdObj = businessId;
      } else if (businessId.toString) {
        businessIdObj = new mongoose.Types.ObjectId(businessId.toString());
      }
    }
    
    // Nếu có cả hotelId và businessId, set cả hai để cả hotel manager và business owner đều thấy
    if (hotelId && businessIdObj) {
      targetType = 'hotel'; // Ưu tiên hotel, nhưng vẫn thêm businessId
      targetHotelsIds = [new mongoose.Types.ObjectId(hotelId)];
      targetBusinessesIds = [businessIdObj];
    } else if (hotelId) {
      // Chỉ có hotelId
      targetType = 'hotel';
      targetHotelsIds = [new mongoose.Types.ObjectId(hotelId)];
    } else if (businessIdObj) {
      // Chỉ có businessId
      targetType = 'business';
      targetBusinessesIds = [businessIdObj];
    }
    
    // Tạo announcement mới
    const newAnnouncement = {
      id: announcementId,
      type: 'info', // Loại thông báo: info, warning, success, etc.
      title: title,
      message: message,
      priority: notificationType === 'systemError' ? 'high' : 'medium',
      startDate: new Date(),
      endDate: null, // Không có ngày kết thúc (thông báo tự động sẽ tự động hết hạn sau 7 ngày)
      isActive: true,
      targetRoles: ['business', 'hotel'], // Chỉ gửi cho business và hotel manager
      targetBusinesses: targetBusinessesIds,
      targetHotels: targetHotelsIds,
      targetType: targetType,
      notificationType: notificationType, // Loại thông báo để map với notifyOn* settings
      createdAt: new Date(),
      createdBy: null // Tự động tạo, không có user cụ thể
    };
    
    // Thêm vào settings
    if (!settings.announcements) {
      settings.announcements = [];
    }
    
    settings.announcements.push(newAnnouncement);
    await settings.save();
    
    console.log(`[createAutoAnnouncement] Created ${notificationType} announcement for room ${roomNumber}:`, {
      announcementId,
      title,
      targetType,
      targetHotels: targetHotelsIds.length,
      targetBusinesses: targetBusinessesIds.length
    });
  } catch (error) {
    console.error('[createAutoAnnouncement] Error creating auto announcement:', error);
    // Không throw error để không ảnh hưởng đến flow chính
  }
}

// Lấy tất cả phòng
async function getallRooms(req, res) {
  try {
    const { hotelId, floor } = req.query;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    // Tạo query dựa trên params
    const query = {};
    
    // Staff chỉ được xem phòng của hotel mà họ trực thuộc
    if (userRole === 'staff') {
      if (userHotelId) {
        // Convert userHotelId sang ObjectId để query đúng
        try {
          if (typeof userHotelId === 'string') {
            query.hotelId = mongoose.Types.ObjectId.isValid(userHotelId) 
              ? new mongoose.Types.ObjectId(userHotelId) 
              : userHotelId;
          } else if (userHotelId instanceof mongoose.Types.ObjectId) {
            query.hotelId = userHotelId;
          } else if (userHotelId.toString) {
            query.hotelId = mongoose.Types.ObjectId.isValid(userHotelId.toString()) 
              ? new mongoose.Types.ObjectId(userHotelId.toString()) 
              : userHotelId.toString();
          } else {
            console.error('Staff userHotelId không hợp lệ:', userHotelId);
            return res.json([]);
          }
          
          console.log('Staff filtering rooms:', {
            userId: req.user?._id,
            userRole: userRole,
            userHotelId: userHotelId,
            queryHotelId: query.hotelId,
            queryHotelIdType: query.hotelId?.constructor?.name
          });
        } catch (convertError) {
          console.error('Error converting staff hotelId to ObjectId:', {
            userHotelId: userHotelId,
            error: convertError.message
          });
          return res.json([]);
        }
      } else {
        // Nếu staff không có hotelId, thử lấy từ Staff model
        const { Staff } = require('../models/staff');
        const staff = await Staff.findOne({ userId: req.user?._id }).select('hotelId');
        if (staff && staff.hotelId) {
          query.hotelId = typeof staff.hotelId === 'string' 
            ? new mongoose.Types.ObjectId(staff.hotelId) 
            : staff.hotelId;
          console.log('Staff hotelId loaded from Staff model:', {
            userId: req.user?._id,
            hotelId: query.hotelId
          });
        } else {
          console.log('Staff không có hotelId:', {
            userId: req.user?._id,
            username: req.user?.username
          });
          return res.json([]);
        }
      }
    } else if (hotelId) {
      // Các role khác có thể filter theo hotelId từ query
      query.hotelId = hotelId;
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem phòng của hotel mình
      query.hotelId = userHotelId;
    } else if (userRole === 'business' && req.user?.businessId) {
      // Business chỉ xem phòng của hotels thuộc business
      // Extract businessId để query đúng
      let userBusinessId = req.user.businessId;
      if (typeof userBusinessId === 'string') {
        userBusinessId = new mongoose.Types.ObjectId(userBusinessId);
      } else if (userBusinessId instanceof mongoose.Types.ObjectId) {
        // Đã là ObjectId, giữ nguyên
      } else if (userBusinessId._id) {
        userBusinessId = typeof userBusinessId._id === 'string' 
          ? new mongoose.Types.ObjectId(userBusinessId._id) 
          : userBusinessId._id;
      } else if (userBusinessId.toString) {
        userBusinessId = new mongoose.Types.ObjectId(userBusinessId.toString());
      }
      
      const { Hotel } = require('../models/hotel');
      const hotels = await Hotel.find({ businessId: userBusinessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      if (hotelIds.length > 0) {
        query.hotelId = { $in: hotelIds };
      } else {
        // Không có hotels, trả về mảng rỗng
        return res.json([]);
      }
    }
    // Admin/Superadmin có thể xem tất cả (không filter)
    
    if (floor) query.floor = parseInt(floor);
    
    // Select các field cần thiết, loại bỏ events và bookingHistory để tránh document quá lớn
    const rooms = await Room.find(query)
      .select('_id roomNumber type status floor hotelId capacity amenities images pricing firstHourRate additionalHourRate priceConfigId priceSettings description notes currentBooking guestStatus')
      .lean(); // Sử dụng lean() để trả về plain object thay vì Mongoose document (nhanh hơn)
    
    // Populate currentBooking với thông tin chuyển phòng cho các phòng có booking
    const roomsWithBookings = rooms.filter(r => r.currentBooking);
    if (roomsWithBookings.length > 0) {
      const bookingIds = roomsWithBookings.map(r => r.currentBooking).filter(Boolean);
      const bookings = await Booking.find({ _id: { $in: bookingIds } })
        .select('_id hotelId roomId guestId checkInDate checkOutDate actualCheckInDate actualCheckOutDate status bookingType adults children basePrice additionalCharges discounts deposit totalAmount paidAmount paymentStatus paymentMethod paymentDetails services source otaSource otaBookingId guestDetails guestInfo notes createdBy logs transferredFrom transferredTo transferredAt transferredBy transferHistory createdAt updatedAt metadata')
        .lean();
      
      // Đảm bảo mỗi booking có guestInfo hoặc guestDetails để frontend có thể lấy được
      bookings.forEach(booking => {
        // Nếu có guestDetails nhưng chưa có guestInfo, chuyển đổi
        if (booking.guestDetails && !booking.guestInfo) {
          booking.guestInfo = {
            name: booking.guestDetails.name || booking.guestDetails.fullName || 'Khách lẻ',
            phone: booking.guestDetails.phone || booking.guestDetails.phoneNumber || '',
            email: booking.guestDetails.email || '',
            idNumber: booking.guestDetails.idNumber || booking.guestDetails.idCard || '',
            address: booking.guestDetails.address || '',
            guestSource: booking.guestDetails.source || booking.source || 'walkin'
          };
        }
        // Nếu có guestInfo nhưng chưa có guestDetails, chuyển đổi ngược lại
        if (booking.guestInfo && !booking.guestDetails) {
          booking.guestDetails = {
            name: booking.guestInfo.name || 'Khách lẻ',
            phone: booking.guestInfo.phone || '',
            email: booking.guestInfo.email || '',
            idNumber: booking.guestInfo.idNumber || '',
            address: booking.guestInfo.address || '',
            source: booking.guestInfo.guestSource || booking.source || 'walkin'
          };
        }
      });
      
      // Tạo map để tra cứu nhanh
      const bookingMap = new Map();
      bookings.forEach(booking => {
        bookingMap.set(booking._id.toString(), booking);
      });
      
      // Populate roomNumber cho transferredFrom và transferredTo
      const roomIdsToFetch = new Set();
      bookings.forEach(booking => {
        if (booking.transferredFrom) roomIdsToFetch.add(booking.transferredFrom.toString());
        if (booking.transferredTo) roomIdsToFetch.add(booking.transferredTo.toString());
      });
      
      if (roomIdsToFetch.size > 0) {
        const transferRooms = await Room.find({ _id: { $in: Array.from(roomIdsToFetch) } })
          .select('_id roomNumber')
          .lean();
        
        const roomNumberMap = new Map();
        transferRooms.forEach(room => {
          roomNumberMap.set(room._id.toString(), room.roomNumber);
        });
        
        // Thêm roomNumber vào booking
        bookings.forEach(booking => {
          if (booking.transferredFrom && roomNumberMap.has(booking.transferredFrom.toString())) {
            booking.transferredFromRoomNumber = roomNumberMap.get(booking.transferredFrom.toString());
          }
          if (booking.transferredTo && roomNumberMap.has(booking.transferredTo.toString())) {
            booking.transferredToRoomNumber = roomNumberMap.get(booking.transferredTo.toString());
          }
        });
      }
      
      // Gán booking vào room
      rooms.forEach(room => {
        if (room.currentBooking) {
          const bookingId = room.currentBooking.toString();
          const booking = bookingMap.get(bookingId);
          if (booking) {
            room.currentBooking = booking;
          }
        }
      });
    }

    const roomsWithoutBooking = rooms.filter(room => room.status === 'occupied' && !room.currentBooking);
    if (roomsWithoutBooking.length > 0) {
      const roomEvents = await Promise.all(
        roomsWithoutBooking.map(async (room) => {
          const event = await getLastUncheckedOutCheckinEvent(room._id);
          return { roomId: room._id.toString(), event };
        })
      );
      const eventMap = new Map();
      roomEvents.forEach(({ roomId, event }) => {
        if (event && event.checkinTime) {
          eventMap.set(roomId, event);
        }
      });

      rooms.forEach(room => {
        if (room.status === 'occupied' && !room.currentBooking) {
          const event = eventMap.get(room._id.toString());
          if (event) {
            const selectedServices = Array.isArray(event.selectedServices) ? event.selectedServices : [];
            const servicesTotal = selectedServices.reduce((sum, service) => sum + (Number(service.totalPrice) || 0), 0);
            room.currentBooking = {
              _id: event._id,
              checkInDate: event.checkinTime,
              actualCheckInDate: event.checkinTime,
              checkinTime: event.checkinTime,
              rateType: event.rateType || 'hourly',
              guestInfo: event.guestInfo,
              advancePayment: event.advancePayment || 0,
              additionalCharges: event.additionalCharges || 0,
              discount: event.discount || 0,
              services: selectedServices,
              selectedServices: selectedServices,
              servicesTotal: event.servicesTotal || servicesTotal,
              totalAmount: event.totalAmount || 0,
              paymentMethod: event.paymentMethod,
              notes: event.notes,
              transferredFrom: event.transferredFrom,
              transferredTo: event.transferredTo,
              transferredAt: event.transferredAt
            };
          }
        }
      });
    }
    
    // Tối ưu hóa dữ liệu trước khi trả về
    const optimizedRooms = rooms.map(room => ({
      ...room,
      notes: room.notes ? (room.notes.substring(0, 200)) : room.notes,
      description: room.description ? (room.description.substring(0, 200)) : room.description,
      // Không trả về events và bookingHistory trong danh sách để giảm kích thước
      events: undefined,
      bookingHistory: undefined
    }));
    
    res.json(optimizedRooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách phòng' });
  }
}

// Tạo phòng mới
async function createRoom(req, res) {
  try {
    const { hotelId, roomNumber, floor, type, roomType, roomCategoryId, firstHourRate, additionalHourRate, dailyRate, nightlyRate, capacity, amenities, images, pricing, status, description, notes } = req.body;
    const currentUser = req.user;
    
    // Business KHÔNG thể tạo phòng, chỉ admin và hotel manager
    if (currentUser.role === 'business') {
      return res.status(403).json({ message: 'Bạn không có quyền tạo phòng. Vui lòng liên hệ Admin hoặc Hotel Manager.' });
    }
    
    // Tìm khách sạn
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    }
    
    // Hotel manager chỉ có thể tạo phòng thuộc hotel của mình
    if (currentUser.role === 'hotel' && hotel._id.toString() !== currentUser.hotelId?.toString()) {
      return res.status(403).json({ message: 'Bạn chỉ có thể tạo phòng cho khách sạn của mình' });
    }
    
    // Kiểm tra số phòng đã tồn tại chưa
    const existingRoom = await Room.findOne({ hotelId, roomNumber: String(roomNumber) });
    if (existingRoom) {
      return res.status(400).json({ message: 'Số phòng đã tồn tại trong khách sạn này' });
    }
    
    // ========== ƯU TIÊN 0: Tìm priceConfig từ roomCategoryId (RoomCategory mới) ==========
    let categoryData = null;
    if (roomCategoryId && mongoose.Types.ObjectId.isValid(roomCategoryId)) {
      try {
        const { RoomCategory } = require('../models/roomCategory');
        categoryData = await RoomCategory.findById(roomCategoryId);
      } catch (err) {
        console.error('Error loading RoomCategory:', err);
      }
      
      try {
        priceConfig = await PriceConfig.findOne({
          roomCategoryId: roomCategoryId,
          isActive: true,
          $or: [
            { effectiveTo: { $exists: false } },
            { effectiveTo: null },
            { effectiveTo: { $gte: new Date() } }
          ]
        }).sort({ effectiveFrom: -1 });
      } catch (err) {
        console.error('Error finding priceConfig by roomCategoryId:', err);
      }
    }
    
    // ========== ƯU TIÊN 1: Tìm priceConfig từ priceConfigId trong request (nếu có) ==========
    let priceConfig = null;
    if (req.body.priceConfigId) {
      try {
        priceConfig = await PriceConfig.findById(req.body.priceConfigId);
      } catch (err) {
        console.error('Error loading priceConfig by ID:', err);
      }
    }
    
    // ========== ƯU TIÊN 2: Tìm priceConfig theo roomType nếu chưa có ==========
    if (!priceConfig && hotelId && (roomType || type)) {
      try {
        priceConfig = await PriceConfig.findOne({
          hotelId,
          roomTypeId: roomType || type,
          isActive: true,
          $or: [
            { effectiveTo: { $exists: false } },
            { effectiveTo: null },
            { effectiveTo: { $gte: new Date() } }
          ]
        }).sort({ effectiveFrom: -1 }); // Lấy config mới nhất
      } catch (err) {
        console.error('Error finding priceConfig by roomType:', err);
      }
    }
    
    // Tạo dữ liệu phòng
    const roomData = {
      hotelId,
      roomNumber: String(roomNumber),
      floor: String(floor), // Chuyển sang string để lưu
      type: type || roomType,
      status: status || 'vacant',
      priceConfigId: priceConfig ? priceConfig._id : (req.body.priceConfigId || null),
      roomCategoryId: (roomCategoryId && mongoose.Types.ObjectId.isValid(roomCategoryId)) ? roomCategoryId : null,
      createdAt: Date.now()
    };
    
    // Thêm các field optional
    if (capacity) roomData.capacity = capacity;
    if (amenities) roomData.amenities = amenities;
    if (images) roomData.images = images;
    if (description) roomData.description = description;
    if (notes) roomData.notes = notes;
    
    // Xử lý priceSettings nếu có
    if (req.body.priceSettings) {
      roomData.priceSettings = {
        nightlyStartTime: req.body.priceSettings.nightlyStartTime || '22:00',
        nightlyEndTime: req.body.priceSettings.nightlyEndTime || '06:00',
        dailyStartTime: req.body.priceSettings.dailyStartTime || '06:00',
        dailyEndTime: req.body.priceSettings.dailyEndTime || '22:00',
        autoNightlyHours: Number(req.body.priceSettings.autoNightlyHours) || 8,
        gracePeriodMinutes: Number(req.body.priceSettings.gracePeriodMinutes) || 15,
        timezone: req.body.priceSettings.timezone || 'UTC+7',
        // Phụ thu cho daily rates
        dailyEarlyCheckinSurcharge: Number(req.body.priceSettings.dailyEarlyCheckinSurcharge) || 0,
        dailyLateCheckoutFee: Number(req.body.priceSettings.dailyLateCheckoutFee) || 0,
        // Phụ thu cho nightly rates
        nightlyEarlyCheckinSurcharge: Number(req.body.priceSettings.nightlyEarlyCheckinSurcharge) || 0,
        nightlyLateCheckoutSurcharge: Number(req.body.priceSettings.nightlyLateCheckoutSurcharge) || 0
      };
    }
    
    // ========== ƯU TIÊN: Sử dụng giá từ priceConfig nếu có ==========
    if (priceConfig) {
      // Ưu tiên lấy giá từ priceConfig
      roomData.hourlyRate = priceConfig.hourlyRates?.firstHourPrice;
      roomData.firstHourRate = priceConfig.hourlyRates?.firstHourPrice;
      roomData.additionalHourRate = priceConfig.hourlyRates?.additionalHourPrice;
      roomData.dailyRate = priceConfig.dailyRates?.standardPrice;
      roomData.nightlyRate = priceConfig.nightlyRates?.standardPrice;
      
      // Cập nhật pricing object từ priceConfig
      roomData.pricing = {
        hourly: priceConfig.hourlyRates?.firstHourPrice || 0,
        daily: priceConfig.dailyRates?.standardPrice || 0,
        nightly: priceConfig.nightlyRates?.standardPrice || 0,
        currency: 'VND'
      };
    } else if (categoryData) {
      // Fallback: Sử dụng giá từ RoomCategory nếu không có PriceConfig
      roomData.pricing = {
        hourly: categoryData.pricing?.hourly || 0,
        daily: categoryData.pricing?.daily || 0,
        nightly: categoryData.pricing?.nightly || 0,
        weekly: categoryData.pricing?.weekly || 0,
        monthly: categoryData.pricing?.monthly || 0,
        currency: categoryData.pricing?.currency || 'VND'
      };
      roomData.firstHourRate = categoryData.firstHourRate || categoryData.pricing?.hourly || 0;
      roomData.additionalHourRate = categoryData.additionalHourRate || 0;
      
      if (categoryData.priceSettings) {
        roomData.priceSettings = {
          nightlyStartTime: categoryData.priceSettings.nightlyStartTime || '22:00',
          nightlyEndTime: categoryData.priceSettings.nightlyEndTime || '12:00',
          dailyStartTime: categoryData.priceSettings.dailyStartTime || '06:00',
          dailyEndTime: categoryData.priceSettings.dailyEndTime || '22:00',
          autoNightlyHours: categoryData.priceSettings.autoNightlyHours || 8,
          gracePeriodMinutes: categoryData.priceSettings.gracePeriodMinutes || 15,
          timezone: categoryData.priceSettings.timezone || 'UTC+7',
          dailyEarlyCheckinSurcharge: categoryData.priceSettings.dailyEarlyCheckinSurcharge || 0,
          dailyLateCheckoutFee: categoryData.priceSettings.dailyLateCheckoutFee || 0,
          nightlyEarlyCheckinSurcharge: categoryData.priceSettings.nightlyEarlyCheckinSurcharge || 0,
          nightlyLateCheckoutSurcharge: categoryData.priceSettings.nightlyLateCheckoutSurcharge || 0
        };
      }
    } else {
      // Fallback: Chỉ sử dụng giá từ body nếu KHÔNG CÓ priceConfig
      // Xử lý pricing nếu có
      if (pricing) {
        roomData.pricing = pricing;
      }
      // Lưu giá từ body, đảm bảo convert sang number và lưu cả khi giá trị là 0
      if (firstHourRate !== undefined && firstHourRate !== null) {
        roomData.firstHourRate = Number(firstHourRate) || 0;
      }
      if (additionalHourRate !== undefined && additionalHourRate !== null) {
        roomData.additionalHourRate = Number(additionalHourRate) || 0;
      }
      if (dailyRate !== undefined && dailyRate !== null) {
        roomData.dailyRate = Number(dailyRate) || 0;
      }
      if (nightlyRate !== undefined && nightlyRate !== null) {
        roomData.nightlyRate = Number(nightlyRate) || 0;
      }
      
      // Nếu có pricing object, cũng lưu vào pricing
      if (pricing) {
        roomData.pricing = roomData.pricing || {};
        if (pricing.hourly !== undefined && pricing.hourly !== null) {
          roomData.pricing.hourly = Number(pricing.hourly) || 0;
        }
        if (pricing.daily !== undefined && pricing.daily !== null) {
          roomData.pricing.daily = Number(pricing.daily) || 0;
        }
        if (pricing.nightly !== undefined && pricing.nightly !== null) {
          roomData.pricing.nightly = Number(pricing.nightly) || 0;
        }
        if (pricing.currency) {
          roomData.pricing.currency = pricing.currency;
        }
      }
    }
    
    // Tạo phòng mới
    const room = new Room(roomData);
    await room.save();
    
    // Cập nhật khách sạn
    hotel.rooms.push(room._id);
    await hotel.save();
    
    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(400).json({ message: error.message });
  }
}

// Helper function để lưu event vào RoomEvent collection
const saveRoomEvent = async (roomId, hotelId, eventData) => {
  try {
    // Đảm bảo roomId và hotelId là ObjectId hợp lệ
    if (!roomId || !hotelId) {
      console.error('Invalid roomId or hotelId:', { roomId, hotelId });
      throw new Error('roomId and hotelId are required');
    }
    
    // Đảm bảo type là bắt buộc
    if (!eventData.type) {
      console.error('Event type is required:', eventData);
      throw new Error('Event type is required');
    }
    
    // Validate và chuyển đổi staffId và transferredBy thành ObjectId hợp lệ hoặc undefined
    // Nếu là "unknown" hoặc không hợp lệ, xóa field (set undefined) để Mongoose không validate
    const sanitizedEventData = { ...eventData };
    
    // Validate staffId - QUAN TRỌNG: Xử lý cả undefined, null, "unknown", và giá trị không hợp lệ
    if (sanitizedEventData.hasOwnProperty('staffId') && sanitizedEventData.staffId !== undefined && sanitizedEventData.staffId !== null) {
      const staffIdValue = sanitizedEventData.staffId;
      // Kiểm tra nếu là "unknown" (string) hoặc không phải ObjectId hợp lệ
      if (staffIdValue === 'unknown' || 
          (typeof staffIdValue === 'string' && staffIdValue.trim() === 'unknown') ||
          (typeof staffIdValue === 'string' && !mongoose.Types.ObjectId.isValid(staffIdValue))) {
        // Xóa field thay vì set null để tránh lỗi validation
        console.log('Removing invalid staffId from eventData:', staffIdValue);
        delete sanitizedEventData.staffId;
      } else {
        try {
          // Chỉ convert nếu là string hợp lệ hoặc chưa phải ObjectId
          if (typeof staffIdValue === 'string' && mongoose.Types.ObjectId.isValid(staffIdValue)) {
            sanitizedEventData.staffId = new mongoose.Types.ObjectId(staffIdValue);
          } else if (!(staffIdValue instanceof mongoose.Types.ObjectId)) {
            // Nếu không phải ObjectId và không phải string hợp lệ, xóa
            console.warn('Invalid staffId type, removing field:', typeof staffIdValue, staffIdValue);
            delete sanitizedEventData.staffId;
          }
          // Nếu đã là ObjectId, giữ nguyên
        } catch (e) {
          console.warn('Error converting staffId to ObjectId, removing field:', e.message, staffIdValue);
          delete sanitizedEventData.staffId;
        }
      }
    } else {
      // Nếu là undefined hoặc null, xóa field để đảm bảo không có giá trị không hợp lệ
      if (sanitizedEventData.hasOwnProperty('staffId')) {
        delete sanitizedEventData.staffId;
      }
    }
    
    // Validate transferredBy - QUAN TRỌNG: Xử lý cả undefined, null, "unknown", và giá trị không hợp lệ
    if (sanitizedEventData.hasOwnProperty('transferredBy') && sanitizedEventData.transferredBy !== undefined && sanitizedEventData.transferredBy !== null) {
      const transferredByValue = sanitizedEventData.transferredBy;
      // Kiểm tra nếu là "unknown" (string) hoặc không phải ObjectId hợp lệ
      if (transferredByValue === 'unknown' || 
          (typeof transferredByValue === 'string' && transferredByValue.trim() === 'unknown') ||
          (typeof transferredByValue === 'string' && !mongoose.Types.ObjectId.isValid(transferredByValue))) {
        // Xóa field thay vì set null để tránh lỗi validation
        console.log('Removing invalid transferredBy from eventData:', transferredByValue);
        delete sanitizedEventData.transferredBy;
      } else {
        try {
          // Chỉ convert nếu là string hợp lệ hoặc chưa phải ObjectId
          if (typeof transferredByValue === 'string' && mongoose.Types.ObjectId.isValid(transferredByValue)) {
            sanitizedEventData.transferredBy = new mongoose.Types.ObjectId(transferredByValue);
          } else if (!(transferredByValue instanceof mongoose.Types.ObjectId)) {
            // Nếu không phải ObjectId và không phải string hợp lệ, xóa
            console.warn('Invalid transferredBy type, removing field:', typeof transferredByValue, transferredByValue);
            delete sanitizedEventData.transferredBy;
          }
          // Nếu đã là ObjectId, giữ nguyên
        } catch (e) {
          console.warn('Error converting transferredBy to ObjectId, removing field:', e.message, transferredByValue);
          delete sanitizedEventData.transferredBy;
        }
      }
    } else {
      // Nếu là undefined hoặc null, xóa field để đảm bảo không có giá trị không hợp lệ
      if (sanitizedEventData.hasOwnProperty('transferredBy')) {
        delete sanitizedEventData.transferredBy;
      }
    }
    
    // Log để debug
    if (eventData.staffId === 'unknown' || eventData.transferredBy === 'unknown') {
      console.log('Sanitized eventData after validation:', {
        originalStaffId: eventData.staffId,
        originalTransferredBy: eventData.transferredBy,
        sanitizedStaffId: sanitizedEventData.staffId,
        sanitizedTransferredBy: sanitizedEventData.transferredBy,
        hasStaffId: sanitizedEventData.hasOwnProperty('staffId'),
        hasTransferredBy: sanitizedEventData.hasOwnProperty('transferredBy')
      });
    }
    
    const roomEvent = new RoomEvent({
      roomId,
      hotelId,
      ...sanitizedEventData
    });
    
    const savedEvent = await roomEvent.save();
    
    console.log('Successfully saved room event:', {
      eventId: savedEvent._id,
      roomId: savedEvent.roomId,
      type: savedEvent.type,
      checkinTime: savedEvent.checkinTime
    });
    
    return savedEvent;
  } catch (error) {
    console.error('Error saving room event:', {
      error: error.message,
      stack: error.stack,
      roomId,
      hotelId,
      eventType: eventData?.type,
      eventData: JSON.stringify(eventData, null, 2)
    });
    // Throw error để caller có thể xử lý
    throw error;
  }
};

// Helper function để đếm số khách hiện tại trong phòng
const getCurrentGuestsCount = async (roomId) => {
  try {
    // Đếm số lượng checkin events chưa checkout trong phòng
    const uncheckedOutCheckinEvents = await RoomEvent.find({
      roomId: roomId,
      type: 'checkin'
    })
      .sort({ checkinTime: -1 })
      .lean();
    
    let count = 0;
    
    // Đếm các event check-in chưa có checkout tương ứng
    for (const checkinEvent of uncheckedOutCheckinEvents) {
      if (!checkinEvent.checkinTime) {
        continue;
      }
      
      const checkinTime = checkinEvent.checkinTime instanceof Date 
        ? checkinEvent.checkinTime 
        : new Date(checkinEvent.checkinTime);
      
      // Tìm checkout event có checkinTime khớp
      const checkoutEvent = await RoomEvent.findOne({
        roomId: roomId,
        type: 'checkout',
        checkinTime: checkinTime
      });
      
      // Nếu không có checkout event, đây là khách đang ở
      if (!checkoutEvent) {
        // Kiểm tra xem event này đã được transfer đi chưa
        const transferredEvent = await RoomEvent.findOne({
          type: 'checkin',
          transferredFrom: roomId,
          checkinTime: checkinTime
        }).lean();
        
        // Nếu chưa được transfer, đếm là 1 khách
        if (!transferredEvent) {
          count++;
        }
      }
    }
    
    return count;
  } catch (error) {
    console.error('Error counting current guests:', error);
    return 0;
  }
};

// Helper function để lấy lastCheckinEvent chưa checkout
const getLastUncheckedOutCheckinEvent = async (roomId) => {
  try {
    // Tìm từ RoomEvent collection (ưu tiên)
    const uncheckedOutCheckinEvents = await RoomEvent.find({
      roomId: roomId,
      type: 'checkin'
    })
      .sort({ checkinTime: -1 })
      .lean();
    
      // Lọc các event check-in chưa có checkout tương ứng và chưa được transfer
      for (const checkinEvent of uncheckedOutCheckinEvents) {
        // Kiểm tra xem có event checkout nào tương ứng với checkin này không
        // So sánh bằng checkinTime (chính xác) - MongoDB sẽ so sánh Date objects chính xác
        if (!checkinEvent.checkinTime) {
          console.warn('Checkin event missing checkinTime:', checkinEvent._id);
          continue; // Bỏ qua event không có checkinTime
        }
        
        // Chuyển checkinTime về Date object nếu là string
        const checkinTime = checkinEvent.checkinTime instanceof Date 
          ? checkinEvent.checkinTime 
          : new Date(checkinEvent.checkinTime);
        
        // QUAN TRỌNG: Chỉ tìm checkout events của phòng hiện tại (roomId)
        // Đảm bảo không lấy checkout events từ phòng khác (ví dụ: phòng mới đã checkout)
        const checkoutEvent = await RoomEvent.findOne({
          roomId: roomId, // QUAN TRỌNG: Chỉ tìm trong phòng hiện tại
          type: 'checkout',
          checkinTime: checkinTime // MongoDB sẽ so sánh Date objects chính xác
        });
        
        // Nếu đã có checkout event trong phòng này, bỏ qua event này
        if (checkoutEvent) {
          console.log('Checkin event already checked out in this room:', {
            roomId: roomId,
            checkinTime: checkinTime.toISOString(),
            checkoutEventId: checkoutEvent._id,
            checkoutEventRoomId: checkoutEvent.roomId
          });
          continue;
        }
        
        // Kiểm tra xem event checkin này đã được transfer đi chưa
        // Cách 1: Kiểm tra xem có checkout event nào trong phòng này có transferredTo (đã chuyển sang phòng khác) không
        const checkoutWithTransfer = await RoomEvent.findOne({
          roomId: roomId, // QUAN TRỌNG: Chỉ tìm trong phòng hiện tại
          type: 'checkout',
          checkinTime: checkinTime,
          transferredTo: { $exists: true, $ne: null }
        }).lean();
        
        // Cách 2: Tìm xem có event checkin nào khác (ở phòng khác) có transferredFrom = roomId và checkinTime khớp không
        // Điều này đảm bảo event checkin ở phòng cũ đã được chuyển sang phòng mới
        const transferredEvent = await RoomEvent.findOne({
          type: 'checkin',
          transferredFrom: roomId, // Phòng hiện tại đã chuyển event này đi
          checkinTime: checkinTime,
          roomId: { $ne: roomId } // Đảm bảo event này ở phòng khác (phòng mới)
        }).lean();
        
        // Nếu tìm thấy checkout event có transferredTo (trong phòng này) hoặc event checkin ở phòng khác có transferredFrom, 
        // bỏ qua event này (đã được chuyển đi)
        if (checkoutWithTransfer || transferredEvent) {
          console.log('Checkin event already transferred:', {
            roomId: roomId,
            checkinTime: checkinTime.toISOString(),
            eventId: checkinEvent._id,
            transferredToRoom: checkoutWithTransfer?.transferredTo || transferredEvent?.roomId,
            hasCheckoutWithTransfer: !!checkoutWithTransfer,
            hasTransferredEvent: !!transferredEvent,
            transferredEventRoomId: transferredEvent?.roomId
          });
          continue;
        }
        
        // Nếu không có checkout event và chưa được transfer, đây là event check-in hợp lệ
        console.log('Found unchecked out checkin event:', {
          checkinTime: checkinTime.toISOString(),
          eventId: checkinEvent._id,
          guestInfo: checkinEvent.guestInfo?.name || 'N/A'
        });
        return checkinEvent;
      }
    
    console.log('No unchecked out checkin event found for room:', roomId);
    return null;
  } catch (error) {
    console.error('Error getting last unchecked out checkin event:', error);
    return null;
  }
};

const getRoomEvents = async (roomId, options = {}) => {
  try {
    const { limit = 1000, skip = 0, type, startDate, endDate, excludeCheckedOut = false } = options;
    
    const query = { roomId };
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    let events = await RoomEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    // Nếu excludeCheckedOut = true, lọc bỏ các check-in events đã có checkout tương ứng hoặc đã được transfer
    if (excludeCheckedOut && (!type || type === 'checkin')) {
      const filteredEvents = [];
      const checkinTimeSet = new Set(); // Để track các checkinTime đã có checkout
      const transferredCheckinTimeSet = new Set(); // Để track các checkinTime đã được transfer
      
      // QUAN TRỌNG: Chỉ lấy checkout events của phòng hiện tại (roomId)
      // Đảm bảo không lấy checkout events từ phòng khác (ví dụ: phòng mới đã checkout)
      const checkoutEvents = await RoomEvent.find({
        roomId: roomId, // QUAN TRỌNG: Chỉ tìm trong phòng hiện tại
        type: 'checkout'
      })
        .select('checkinTime transferredTo roomId')
        .lean();
      
      // Tạo set các checkinTime đã checkout trong phòng này (bao gồm cả checkout có transferredTo)
      checkoutEvents.forEach(checkout => {
        // Đảm bảo checkout event thuộc về phòng hiện tại
        if (checkout.roomId && checkout.roomId.toString() === roomId.toString() && checkout.checkinTime) {
          // Chuyển về timestamp để so sánh chính xác
          const checkinTimeStr = new Date(checkout.checkinTime).toISOString();
          checkinTimeSet.add(checkinTimeStr);
          // Nếu checkout event có transferredTo, cũng đánh dấu là đã transfer
          if (checkout.transferredTo) {
            transferredCheckinTimeSet.add(checkinTimeStr);
          }
        }
      });
      
      // Lấy tất cả check-in events ở phòng khác có transferredFrom = roomId để biết checkinTime nào đã được transfer
      // QUAN TRỌNG: Chỉ lấy events ở phòng khác (roomId != roomId hiện tại)
      const transferredEvents = await RoomEvent.find({
        type: 'checkin',
        transferredFrom: roomId, // Phòng hiện tại đã chuyển event này đi
        roomId: { $ne: roomId } // Đảm bảo event này ở phòng khác (phòng mới)
      })
        .select('checkinTime transferredFrom roomId')
        .lean();
      
      // Tạo set các checkinTime đã được transfer
      transferredEvents.forEach(transferred => {
        // Đảm bảo transferred event thuộc về phòng khác
        if (transferred.roomId && transferred.roomId.toString() !== roomId.toString() && transferred.checkinTime) {
          const checkinTimeStr = new Date(transferred.checkinTime).toISOString();
          transferredCheckinTimeSet.add(checkinTimeStr);
        }
      });
      
      // Lọc events: chỉ giữ check-in events chưa có checkout tương ứng và chưa được transfer
      for (const event of events) {
        if (event.type === 'checkin') {
          const eventCheckinTimeStr = event.checkinTime ? new Date(event.checkinTime).toISOString() : null;
          // Chỉ thêm nếu chưa có checkout tương ứng và chưa được transfer
          if (eventCheckinTimeStr && 
              !checkinTimeSet.has(eventCheckinTimeStr) && 
              !transferredCheckinTimeSet.has(eventCheckinTimeStr)) {
            filteredEvents.push(event);
          }
        } else {
          // Giữ tất cả events khác (checkout, maintenance, etc.)
          filteredEvents.push(event);
        }
      }
      
      events = filteredEvents;
    }
    
    return events;
  } catch (error) {
    console.error('Error getting room events:', error);
    return [];
  }
};

const cleanupRoomEvents = async (roomId, maxEvents = 10) => {
  try {
    const totalEvents = await RoomEvent.countDocuments({ roomId });
    if (totalEvents <= maxEvents) return;

    const excess = totalEvents - maxEvents;
    const oldEvents = await RoomEvent.find({ roomId })
      .sort({ createdAt: 1 })
      .limit(excess)
      .select('_id')
      .lean();

    const idsToDelete = oldEvents.map(e => e._id).filter(id => id);
    if (!idsToDelete.length) return;

    await RoomEvent.deleteMany({ _id: { $in: idsToDelete } });
    console.log(`Cleanup RoomEvent: deleted ${idsToDelete.length} old events for room ${roomId}`);
  } catch (error) {
    console.error('Error cleaning up room events:', error);
  }
};

// Helper function để lưu event vào RoomEvent collection (chỉ lưu vào RoomEvent, không lưu vào room.events nữa)
const saveEventToBoth = async (room, eventData) => {
  return await saveRoomEvent(room._id, room.hotelId, eventData);
};

// Helper function để tối ưu hóa events - giới hạn số lượng và độ dài string (cho backward compatibility)
const optimizeEvents = (events, maxItems = 500) => {
  if (!events || !Array.isArray(events)) return [];
  
  // Giới hạn số lượng items
  const limited = events.slice(-maxItems); // Lấy maxItems items gần nhất
  
  return limited.map(event => ({
    _id: event._id,
    type: event.type,
    checkinTime: event.checkinTime,
    checkoutTime: event.checkoutTime,
    expectedCheckoutTime: event.expectedCheckoutTime,
    payment: event.payment,
    userId: event.userId,
    staffId: event.staffId,
    guestInfo: event.guestInfo ? {
      name: (event.guestInfo.name || '').substring(0, 100),
      idNumber: (event.guestInfo.idNumber || '').substring(0, 50),
      phone: (event.guestInfo.phone || '').substring(0, 20),
      email: (event.guestInfo.email || '').substring(0, 100),
      address: (event.guestInfo.address || '').substring(0, 200),
      guestSource: event.guestInfo.guestSource || 'walkin' // Đảm bảo có guestSource
    } : null,
    paymentMethod: event.paymentMethod,
    paymentStatus: event.paymentStatus, // Trạng thái thanh toán từ RoomEvent model
    paymentTransactionId: event.paymentTransactionId, // ID giao dịch thanh toán
    rateType: event.rateType,
    advancePayment: event.advancePayment,
    additionalCharges: event.additionalCharges,
    discount: event.discount,
    notes: (event.notes || '').substring(0, 500),
    selectedServices: (event.selectedServices || []).slice(0, 50).map(service => ({
      serviceId: service.serviceId,
      serviceName: (service.serviceName || '').substring(0, 100),
      price: service.price,
      quantity: service.quantity,
      totalPrice: service.totalPrice,
      orderTime: service.orderTime
    })),
    transferredFrom: event.transferredFrom,
    transferredAt: event.transferredAt,
    transferredBy: event.transferredBy
  }));
};

// Helper function để tối ưu hóa bookingHistory
const optimizeBookingHistory = (bookingHistory, maxItems = 500) => {
  if (!bookingHistory || !Array.isArray(bookingHistory)) return [];
  
  // Giới hạn số lượng items
  const limited = bookingHistory.slice(-maxItems); // Lấy maxItems items gần nhất
  
  return limited.map(history => ({
    _id: history._id,
    event: history.event,
    customerName: (history.customerName || '').substring(0, 100),
    customerPhone: (history.customerPhone || '').substring(0, 20),
    roomNumber: (history.roomNumber || '').substring(0, 20),
    date: history.date,
    bookingId: history.bookingId,
    userId: history.userId,
    staffId: history.staffId,
    amount: history.amount,
    additionalCharges: history.additionalCharges,
    discount: history.discount,
    totalAmount: history.totalAmount,
    checkInTime: history.checkInTime,
    checkOutTime: history.checkOutTime,
    guestInfo: history.guestInfo ? {
      name: (history.guestInfo.name || '').substring(0, 100),
      idNumber: (history.guestInfo.idNumber || '').substring(0, 50),
      phone: (history.guestInfo.phone || '').substring(0, 20),
      email: (history.guestInfo.email || '').substring(0, 100),
      address: (history.guestInfo.address || '').substring(0, 200),
      guestSource: history.guestInfo.guestSource || 'walkin' // Thêm guestSource vào guestInfo
    } : null,
    guestSource: history.guestSource || history.guestInfo?.guestSource || 'walkin', // Thêm guestSource ở cấp root
    paymentMethod: history.paymentMethod,
    paymentStatus: history.paymentStatus,
    rateType: history.rateType,
    advancePayment: history.advancePayment,
    roomTotal: history.roomTotal,
    servicesTotal: history.servicesTotal,
    services: (history.services || []).slice(0, 50).map(service => ({
      serviceId: service.serviceId,
      serviceName: (service.serviceName || '').substring(0, 100),
      price: service.price,
      quantity: service.quantity,
      totalPrice: service.totalPrice
    })),
    invoiceNumber: (history.invoiceNumber || '').substring(0, 50),
    serviceDetails: history.serviceDetails,
    notes: (history.notes || '').substring(0, 500),
    targetRoomId: history.targetRoomId,
    targetRoomNumber: (history.targetRoomNumber || '').substring(0, 20)
  }));
};

// Lấy phòng theo ID
async function getRoomById(req, res) {
  try {
    const { limit = 1000, includeOldEvents = false, excludeCheckedOut = false } = req.query;
    
    const room = await Room.findById(req.params.id)
      .populate('priceConfigId')
      .populate('services')
      .lean(); // Sử dụng lean() để trả về plain object, nhanh hơn và dễ xử lý
      
    if (!room) return res.status(404).json({ message: 'Không tìm thấy phòng' });
    
    // Populate currentBooking với thông tin chuyển phòng nếu có
    if (room.currentBooking) {
      try {
        const booking = await Booking.findById(room.currentBooking)
          .select('_id hotelId roomId guestId checkInDate checkOutDate actualCheckInDate actualCheckOutDate status bookingType adults children basePrice additionalCharges discounts deposit totalAmount paidAmount paymentStatus paymentMethod paymentDetails services source otaSource otaBookingId guestDetails guestInfo notes createdBy logs transferredFrom transferredTo transferredAt transferredBy transferHistory createdAt updatedAt metadata')
          .lean();
        
        // Đảm bảo booking có guestInfo hoặc guestDetails để frontend có thể lấy được
        if (booking) {
          // Nếu có guestDetails nhưng chưa có guestInfo, chuyển đổi
          if (booking.guestDetails && !booking.guestInfo) {
            booking.guestInfo = {
              name: booking.guestDetails.name || booking.guestDetails.fullName || 'Khách lẻ',
              phone: booking.guestDetails.phone || booking.guestDetails.phoneNumber || '',
              email: booking.guestDetails.email || '',
              idNumber: booking.guestDetails.idNumber || booking.guestDetails.idCard || '',
              address: booking.guestDetails.address || '',
              guestSource: booking.guestDetails.source || booking.source || 'walkin'
            };
          }
          // Nếu có guestInfo nhưng chưa có guestDetails, chuyển đổi ngược lại
          if (booking.guestInfo && !booking.guestDetails) {
            booking.guestDetails = {
              name: booking.guestInfo.name || 'Khách lẻ',
              phone: booking.guestInfo.phone || '',
              email: booking.guestInfo.email || '',
              idNumber: booking.guestInfo.idNumber || '',
              address: booking.guestInfo.address || '',
              source: booking.guestInfo.guestSource || booking.source || 'walkin'
            };
          }
        }
        
        if (booking) {
          // Populate transferredFrom và transferredTo với roomNumber
          if (booking.transferredFrom) {
            const fromRoom = await Room.findById(booking.transferredFrom).select('roomNumber').lean();
            if (fromRoom) {
              booking.transferredFromRoomNumber = fromRoom.roomNumber;
            }
          }
          if (booking.transferredTo) {
            const toRoom = await Room.findById(booking.transferredTo).select('roomNumber').lean();
            if (toRoom) {
              booking.transferredToRoomNumber = toRoom.roomNumber;
            }
          }
          
          room.currentBooking = booking;
        }
      } catch (bookingError) {
        console.error('Error populating currentBooking:', bookingError);
        // Không throw error, chỉ log để không ảnh hưởng đến response
      }
    }
    
    // Lấy events từ RoomEvent collection (mới)
    // Nếu excludeCheckedOut = true, chỉ lấy check-in events chưa checkout
    const events = await getRoomEvents(room._id, { 
      limit: parseInt(limit),
      excludeCheckedOut: excludeCheckedOut === 'true' || excludeCheckedOut === true
    });
    
    // Không còn đọc từ room.events nữa, chỉ sử dụng events từ RoomEvent collection
    const allEvents = events;
    
    // Lấy priceConfig nếu có (đã được populate)
    let priceConfigData = null;
    if (room.priceConfigId && typeof room.priceConfigId === 'object') {
      // priceConfigId đã được populate thành object
      priceConfigData = {
        nightlyRates: {
          startTime: room.priceConfigId.nightlyRates?.startTime || '22:00',
          endTime: room.priceConfigId.nightlyRates?.endTime || '12:00',
          earlyCheckinSurcharge: room.priceConfigId.nightlyRates?.earlyCheckinSurcharge || 0,
          lateCheckoutSurcharge: room.priceConfigId.nightlyRates?.lateCheckoutSurcharge || 0
        },
        dailyRates: {
          checkInTime: room.priceConfigId.dailyRates?.checkInTime || '14:00',
          checkOutTime: room.priceConfigId.dailyRates?.checkOutTime || '12:00',
          earlyCheckinSurcharge: room.priceConfigId.dailyRates?.earlyCheckinSurcharge || 0,
          latecheckOutFee: room.priceConfigId.dailyRates?.latecheckOutFee || 0
        }
      };
    } else if (room.priceConfigId) {
      // priceConfigId là string/ObjectId, cần fetch
      try {
        const priceConfig = await PriceConfig.findById(room.priceConfigId).lean();
        if (priceConfig) {
          priceConfigData = {
            nightlyRates: {
              startTime: priceConfig.nightlyRates?.startTime || '22:00',
              endTime: priceConfig.nightlyRates?.endTime || '12:00',
              earlyCheckinSurcharge: priceConfig.nightlyRates?.earlyCheckinSurcharge || 0,
              lateCheckoutSurcharge: priceConfig.nightlyRates?.lateCheckoutSurcharge || 0
            },
            dailyRates: {
              checkInTime: priceConfig.dailyRates?.checkInTime || '14:00',
              checkOutTime: priceConfig.dailyRates?.checkOutTime || '12:00',
              earlyCheckinSurcharge: priceConfig.dailyRates?.earlyCheckinSurcharge || 0,
              latecheckOutFee: priceConfig.dailyRates?.latecheckOutFee || 0
            }
          };
        }
      } catch (err) {
        console.error('Error fetching priceConfig for room:', err);
      }
    }
    
    const maxEventsToReturn = parseInt(limit) || 1000;

    const optimizedRoom = {
      ...room,
      events: optimizeEvents(allEvents, maxEventsToReturn),
      bookingHistory: optimizeBookingHistory(room.bookingHistory, 500),
      notes: room.notes ? (room.notes.substring(0, 1000)) : room.notes,
      description: room.description ? (room.description.substring(0, 1000)) : room.description,
      priceConfig: priceConfigData
    };
    
    delete optimizedRoom.events;
    optimizedRoom.events = optimizeEvents(allEvents, maxEventsToReturn);
    
    if (allEvents.length > maxEventsToReturn) {
      console.warn(`Warning: Room ${room.roomNumber} có ${allEvents.length} events, đã giới hạn xuống ${maxEventsToReturn} events`);
    }
    if (room.bookingHistory && room.bookingHistory.length > 500) {
      console.warn(`Warning: Room ${room.roomNumber} có ${room.bookingHistory.length} bookingHistory items, đã giới hạn xuống 500 items`);
    }
    
    res.status(200).json(optimizedRoom);
  } catch (error) {
    console.error('Error getting room by ID:', error);
    res.status(500).json({ message: error.message });
  }
}

// Cập nhật phòng
async function updateRoom(req, res) {
  try {
    const roomId = req.params.id;
    const updates = req.body;
    const currentUser = req.user;
    
    // Business KHÔNG thể cập nhật phòng, chỉ admin và hotel manager
    if (currentUser.role === 'business') {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật phòng. Vui lòng liên hệ Admin hoặc Hotel Manager.' });
    }
    
    // Tìm phòng để kiểm tra quyền
    const room = await Room.findById(roomId).populate('hotelId');
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    // Hotel manager chỉ có thể cập nhật phòng thuộc hotel của mình
    if (currentUser.role === 'hotel' && room.hotelId._id.toString() !== currentUser.hotelId?.toString()) {
      return res.status(403).json({ message: 'Bạn chỉ có thể cập nhật phòng thuộc khách sạn của mình' });
    }
    
    // ========== ƯU TIÊN 1: Xử lý priceConfigId trước ==========
    let usePriceConfig = false;
    let priceConfig = null;
    
    if (updates.priceConfigId !== undefined) {
      if (updates.priceConfigId && updates.priceConfigId !== null && updates.priceConfigId !== '') {
        // Có priceConfigId hợp lệ, tìm priceConfig
        try {
          priceConfig = await PriceConfig.findById(updates.priceConfigId);
          if (priceConfig) {
            // ƯU TIÊN: Sử dụng giá từ priceConfig
            updates.firstHourRate = priceConfig.hourlyRates?.firstHourPrice;
            updates.additionalHourRate = priceConfig.hourlyRates?.additionalHourPrice;
            updates.dailyRate = priceConfig.dailyRates?.standardPrice;
            updates.nightlyRate = priceConfig.nightlyRates?.standardPrice;
            updates.priceConfigId = priceConfig._id;
            
            // Cập nhật pricing object từ priceConfig
            if (!updates.pricing) updates.pricing = {};
            updates.pricing.hourly = priceConfig.hourlyRates?.firstHourPrice || 0;
            updates.pricing.daily = priceConfig.dailyRates?.standardPrice || 0;
            updates.pricing.nightly = priceConfig.nightlyRates?.standardPrice || 0;
            
            usePriceConfig = true;
          } else {
            // Không tìm thấy priceConfig, xóa priceConfigId và sử dụng giá từ body
            updates.priceConfigId = null;
            usePriceConfig = false;
          }
        } catch (err) {
          console.error('Error loading priceConfig:', err);
          updates.priceConfigId = null;
          usePriceConfig = false;
        }
      } else {
        // priceConfigId là null hoặc empty, xóa priceConfigId và sử dụng giá từ body
        updates.priceConfigId = null;
        usePriceConfig = false;
      }
    } else {
      // Nếu không có priceConfigId trong updates, thử tìm theo room type
      // Lưu ý: room đã được load ở trên để kiểm tra quyền
      if (room && room.hotelId && room.type) {
        try {
          priceConfig = await PriceConfig.findOne({
            hotelId: room.hotelId,
            roomTypeId: room.type,
            isActive: true,
            $or: [
              { effectiveTo: { $exists: false } },
              { effectiveTo: null },
              { effectiveTo: { $gte: new Date() } }
            ]
          }).sort({ effectiveFrom: -1 });
          
          if (priceConfig) {
            // Tự động gán priceConfig nếu tìm thấy
            updates.priceConfigId = priceConfig._id;
            updates.firstHourRate = priceConfig.hourlyRates?.firstHourPrice;
            updates.additionalHourRate = priceConfig.hourlyRates?.additionalHourPrice;
            updates.dailyRate = priceConfig.dailyRates?.standardPrice;
            updates.nightlyRate = priceConfig.nightlyRates?.standardPrice;
            
            if (!updates.pricing) updates.pricing = {};
            updates.pricing.hourly = priceConfig.hourlyRates?.firstHourPrice || 0;
            updates.pricing.daily = priceConfig.dailyRates?.standardPrice || 0;
            updates.pricing.nightly = priceConfig.nightlyRates?.standardPrice || 0;
            
            usePriceConfig = true;
          }
        } catch (err) {
          console.error('Error finding priceConfig by roomType:', err);
        }
      }
    }
    
    // ========== FALLBACK: Xử lý giá từ body (chỉ áp dụng nếu KHÔNG sử dụng priceConfig) ==========
    if (!usePriceConfig) {
      // Chỉ cập nhật firstHourRate nếu có giá trị được gửi lên
      if (updates.firstHourRate !== undefined && updates.firstHourRate !== null) {
        updates.firstHourRate = Number(updates.firstHourRate) || 0;
      } else {
        // Nếu không có giá trị, xóa khỏi updates để không ghi đè giá trị hiện tại
        delete updates.firstHourRate;
      }
      // Chỉ cập nhật additionalHourRate nếu có giá trị được gửi lên (kể cả 0)
      if (updates.additionalHourRate !== undefined && updates.additionalHourRate !== null) {
        updates.additionalHourRate = Number(updates.additionalHourRate);
      } else {
        // Nếu không có giá trị, xóa khỏi updates để không ghi đè giá trị hiện tại
        delete updates.additionalHourRate;
      }
    }
    
    // Cập nhật pricing nếu có
    if (updates.pricing) {
      if (updates.pricing.hourly !== undefined && updates.pricing.hourly !== null) {
        updates.pricing.hourly = Number(updates.pricing.hourly) || 0;
      }
      if (updates.pricing.daily !== undefined && updates.pricing.daily !== null) {
        updates.pricing.daily = Number(updates.pricing.daily) || 0;
      }
      if (updates.pricing.nightly !== undefined && updates.pricing.nightly !== null) {
        updates.pricing.nightly = Number(updates.pricing.nightly) || 0;
      }
    }
    
    // Cập nhật priceSettings nếu có
    if (updates.priceSettings) {
      if (updates.priceSettings.nightlyStartTime) {
        updates.priceSettings.nightlyStartTime = String(updates.priceSettings.nightlyStartTime);
      }
      if (updates.priceSettings.nightlyEndTime) {
        updates.priceSettings.nightlyEndTime = String(updates.priceSettings.nightlyEndTime);
      }
      if (updates.priceSettings.dailyStartTime) {
        updates.priceSettings.dailyStartTime = String(updates.priceSettings.dailyStartTime);
      }
      if (updates.priceSettings.dailyEndTime) {
        updates.priceSettings.dailyEndTime = String(updates.priceSettings.dailyEndTime);
      }
      if (updates.priceSettings.autoNightlyHours !== undefined && updates.priceSettings.autoNightlyHours !== null) {
        updates.priceSettings.autoNightlyHours = Number(updates.priceSettings.autoNightlyHours) || 8;
      }
      if (updates.priceSettings.gracePeriodMinutes !== undefined && updates.priceSettings.gracePeriodMinutes !== null) {
        updates.priceSettings.gracePeriodMinutes = Number(updates.priceSettings.gracePeriodMinutes) || 15;
      }
      if (updates.priceSettings.timezone) {
        updates.priceSettings.timezone = String(updates.priceSettings.timezone);
      }
      // Phụ thu cho daily rates
      if (updates.priceSettings.dailyEarlyCheckinSurcharge !== undefined && updates.priceSettings.dailyEarlyCheckinSurcharge !== null) {
        updates.priceSettings.dailyEarlyCheckinSurcharge = Number(updates.priceSettings.dailyEarlyCheckinSurcharge) || 0;
      }
      if (updates.priceSettings.dailyLateCheckoutFee !== undefined && updates.priceSettings.dailyLateCheckoutFee !== null) {
        updates.priceSettings.dailyLateCheckoutFee = Number(updates.priceSettings.dailyLateCheckoutFee) || 0;
      }
      // Phụ thu cho nightly rates
      if (updates.priceSettings.nightlyEarlyCheckinSurcharge !== undefined && updates.priceSettings.nightlyEarlyCheckinSurcharge !== null) {
        updates.priceSettings.nightlyEarlyCheckinSurcharge = Number(updates.priceSettings.nightlyEarlyCheckinSurcharge) || 0;
      }
      if (updates.priceSettings.nightlyLateCheckoutSurcharge !== undefined && updates.priceSettings.nightlyLateCheckoutSurcharge !== null) {
        updates.priceSettings.nightlyLateCheckoutSurcharge = Number(updates.priceSettings.nightlyLateCheckoutSurcharge) || 0;
      }
    }
    
    // Log để debug
    console.log('Updating room:', {
      roomId,
      additionalHourRate: updates.additionalHourRate,
      firstHourRate: updates.firstHourRate,
      priceConfigId: updates.priceConfigId
    });
    
    const updatedRoom = await Room.findByIdAndUpdate(roomId, updates, { new: true, runValidators: true });
    if (!updatedRoom) return res.status(404).json({ message: 'Không tìm thấy phòng' });
    
    // Log để debug
    console.log('Updated room:', {
      additionalHourRate: updatedRoom.additionalHourRate,
      firstHourRate: updatedRoom.firstHourRate,
      priceConfigId: updatedRoom.priceConfigId
    });
    
    res.status(200).json(updatedRoom);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(400).json({ message: error.message });
  }
}

// Xóa phòng
async function deleteRoom(req, res) {
  try {
    const roomId = req.params.id;
    const currentUser = req.user;
    
    // Business KHÔNG thể xóa phòng, chỉ admin và hotel manager
    if (currentUser.role === 'business') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa phòng. Vui lòng liên hệ Admin hoặc Hotel Manager.' });
    }
    
    // Kiểm tra xem phòng có đang được đặt không
    const activeBookings = await Booking.find({
      roomId,
      status: { $in: ['pending', 'confirmed', 'checked_in'] }
    });
    
    if (activeBookings.length > 0) {
      return res.status(400).json({
        message: 'Không thể xóa phòng đang có đặt phòng đang hoạt động'
      });
    }
    
    const room = await Room.findById(roomId).populate('hotelId');
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    // Hotel manager chỉ có thể xóa phòng thuộc hotel của mình
    if (currentUser.role === 'hotel' && room.hotelId._id.toString() !== currentUser.hotelId?.toString()) {
      return res.status(403).json({ message: 'Bạn chỉ có thể xóa phòng thuộc khách sạn của mình' });
    }
    
    // Cập nhật danh sách phòng trong khách sạn
    await Hotel.findByIdAndUpdate(
      room.hotelId,
      { $pull: { rooms: roomId } }
    );
    
    // Xóa phòng
    await Room.findByIdAndDelete(roomId);
    
    res.status(200).json({ message: 'Đã xóa phòng thành công' });
  } catch (error) {
      res.status(500).json({ message: error.message });
  }
}

// Check-in
async function checkinRoom(req, res) {
  try {
    const { id: roomId } = req.params;
    
    // Hỗ trợ cả 2 format: trực tiếp từ body hoặc từ events array
    let checkinData = {};
    
    if (req.body.events && Array.isArray(req.body.events) && req.body.events.length > 0) {
      // Format từ frontend modal: { status, events: [{...}] }
      const checkinEvent = req.body.events.find(e => e.type === 'checkin') || req.body.events[0];
      
      // ƯU TIÊN: Sử dụng checkinTime từ frontend, đảm bảo parse đúng Date
      let checkInTime = null;
      // Load room để lấy timezone
      const roomForTimezone = await Room.findById(roomId);
      const timezone = roomForTimezone ? getTimezoneFromRoom(roomForTimezone) : 'UTC+7';
      
      if (checkinEvent.checkinTime || checkinEvent.checkInTime || checkinEvent.checkInDate || checkinEvent.checkinDate) {
        const rawCheckinTime = checkinEvent.checkinTime || checkinEvent.checkInTime || checkinEvent.checkInDate || checkinEvent.checkinDate;
        checkInTime = new Date(rawCheckinTime);
        // Kiểm tra Date hợp lệ
        if (isNaN(checkInTime.getTime())) {
          console.warn(`Invalid checkinTime from frontend, using current time with timezone ${timezone}`);
          checkInTime = getTimeByTimezone(timezone);
        }
      } else {
        // Nếu không có checkinTime từ frontend, dùng thời gian hiện tại theo timezone của room
        checkInTime = getTimeByTimezone(timezone);
      }
      
      const normalizedPaymentMethod = mapRoomPaymentMethod(checkinEvent.paymentMethod || req.body.paymentMethod);
      const guestInfoFromEvent = checkinEvent.guestInfo || {
        name: checkinEvent.guestName || checkinEvent.customerName || '',
        phone: checkinEvent.guestPhone || checkinEvent.customerPhone || '',
        idNumber: checkinEvent.guestId || checkinEvent.idNumber || '',
        email: checkinEvent.guestEmail || '',
        address: checkinEvent.guestAddress || '',
        guestSource: checkinEvent.guestSource
      };

      checkinData = {
        customerId: checkinEvent.userId || checkinEvent.customerId,
        staffId: checkinEvent.staffId || req.body.staffId,
        checkInTime: checkInTime, // Sử dụng thời gian đã parse
        guestInfo: guestInfoFromEvent,
        paymentMethod: normalizedPaymentMethod,
        rateType: checkinEvent.rateType || 'hourly',
        advancePayment: checkinEvent.advancePayment || 0,
        additionalCharges: checkinEvent.additionalCharges || 0,
        discount: checkinEvent.discount || 0,
        notes: checkinEvent.notes,
        selectedServices: checkinEvent.selectedServices || []
      };
    } else {
      // Format trực tiếp từ body
      // ƯU TIÊN: Sử dụng checkInTime từ frontend, đảm bảo parse đúng Date
      let checkInTime = null;
      if (req.body.checkInTime || req.body.checkinTime || req.body.checkInDate || req.body.checkinDate) {
        const rawCheckInTime = req.body.checkInTime || req.body.checkinTime || req.body.checkInDate || req.body.checkinDate;
        checkInTime = new Date(rawCheckInTime);
        // Kiểm tra Date hợp lệ
        if (isNaN(checkInTime.getTime())) {
          console.warn('Invalid checkInTime from frontend, using current time with room timezone');
          // Lấy timezone từ room nếu có
          const room = await Room.findById(roomId);
          const timezone = room ? getTimezoneFromRoom(room) : 'UTC+7';
          checkInTime = getTimeByTimezone(timezone);
        }
      } else {
        // Nếu không có checkInTime từ frontend, LUÔN dùng thời gian hiện tại theo timezone của room
        const room = await Room.findById(roomId);
        const timezone = room ? getTimezoneFromRoom(room) : 'UTC+7';
        checkInTime = getTimeByTimezone(timezone);
        console.log(`No checkInTime from frontend, using current time with timezone ${timezone}: ${checkInTime.toISOString()}`);
      }
      
      const normalizedPaymentMethod = mapRoomPaymentMethod(req.body.paymentMethod);
      const guestInfoFromBody = req.body.guestInfo || {
        name: req.body.guestName || req.body.customerName || '',
        phone: req.body.guestPhone || req.body.customerPhone || '',
        idNumber: req.body.guestId || req.body.idNumber || '',
        email: req.body.guestEmail || '',
        address: req.body.guestAddress || '',
        guestSource: req.body.guestSource
      };

      checkinData = {
        customerId: req.body.customerId,
        staffId: req.body.staffId,
        checkInTime: checkInTime, // Sử dụng thời gian đã parse
        guestInfo: guestInfoFromBody,
        paymentMethod: normalizedPaymentMethod,
        rateType: req.body.rateType || 'hourly',
        advancePayment: req.body.advancePayment || 0,
        additionalCharges: req.body.additionalCharges || 0,
        discount: req.body.discount || 0,
        notes: req.body.notes,
        selectedServices: req.body.selectedServices || []
      };
    }
    
    const { customerId, staffId, checkInTime, guestInfo, paymentMethod, rateType, 
            advancePayment, additionalCharges, discount, notes, selectedServices } = checkinData;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra conflict với bookings
    const timezone = getTimezoneFromRoom(room);
    const actualCheckInTime = checkInTime ? new Date(checkInTime) : getTimeByTimezone(timezone);
    const bookingId = req.body.bookingId; // Lấy bookingId nếu có (check-in từ booking)
    
    // Nếu có bookingId, tìm booking đó để bỏ qua conflict check với chính nó
    let currentBookingData = null;
    if (bookingId) {
      try {
        currentBookingData = await Booking.findById(bookingId);
      } catch (err) {
        console.error('Error finding booking:', err);
      }
    }
    
    // Kiểm tra bookings trong RoomEvent collection (chỉ kiểm tra conflict với các booking khác, không phải booking đang check-in)
    const bookingEvents = await RoomEvent.find({
      roomId: room._id,
      type: 'booking'
    }).lean();
    
    if (bookingEvents && bookingEvents.length > 0) {
      for (const bookingEvent of bookingEvents) {
        // Bỏ qua booking đã bị hủy
        const isCancelled = bookingEvent.cancelledAt || 
                          (bookingEvent.notes && bookingEvent.notes.includes('[Đã hủy]'));
        if (isCancelled) {
          continue; // Bỏ qua booking đã hủy
        }
        
        // Bỏ qua booking đang được check-in nếu có bookingId
        if (bookingId) {
          // Kiểm tra bằng bookingId trong event (nếu có)
          if (bookingEvent.bookingId) {
            const eventBookingId = bookingEvent.bookingId._id ? bookingEvent.bookingId._id.toString() : 
                                   bookingEvent.bookingId.toString ? bookingEvent.bookingId.toString() : null;
            if (eventBookingId && eventBookingId === bookingId.toString()) {
              continue; // Đây là booking đang được check-in, bỏ qua
            }
          }
          
          // Hoặc kiểm tra bằng _id của event (nếu có)
          if (bookingEvent._id && bookingEvent._id.toString() === bookingId.toString()) {
            continue; // Đây là booking đang được check-in, bỏ qua
          }
          
          // Hoặc nếu trùng thời gian với booking đang check-in, bỏ qua
          if (currentBookingData) {
            const bookingCheckIn = bookingEvent.checkinTime ? new Date(bookingEvent.checkinTime) : null;
            const currentBookingCheckIn = currentBookingData.checkInDate ? new Date(currentBookingData.checkInDate) : null;
            
            if (bookingCheckIn && currentBookingCheckIn && 
                Math.abs(bookingCheckIn.getTime() - currentBookingCheckIn.getTime()) < 60000) { // Trong vòng 1 phút
              continue; // Trùng thời gian, bỏ qua
            }
          }
        }
        
        // Kiểm tra conflict với booking khác (chỉ với booking chưa bị hủy)
        if (bookingEvent.checkinTime && bookingEvent.expectedCheckoutTime) {
          const bookingCheckIn = new Date(bookingEvent.checkinTime);
          const bookingCheckOut = new Date(bookingEvent.expectedCheckoutTime);
          
          // Kiểm tra overlap: chỉ từ chối nếu check-in trùng với thời gian booking khác
          const hasOverlap = (
            (actualCheckInTime >= bookingCheckIn && actualCheckInTime < bookingCheckOut)
          );
          
          if (hasOverlap) {
            return res.status(400).json({ 
              error: `Phòng đã được đặt từ ${bookingCheckIn.toLocaleString('vi-VN')} đến ${bookingCheckOut.toLocaleString('vi-VN')}. Vui lòng chọn thời gian khác.` 
            });
          }
        }
      }
    }
    
    // Kiểm tra currentBooking nếu có (chỉ nếu không phải booking đang được check-in)
    if (room.currentBooking && room.status === 'booked') {
      // Kiểm tra xem currentBooking có bị hủy không
      let currentBookingIsCancelled = false;
      
      // Nếu currentBooking là ObjectId, tìm booking trong database
      if (room.currentBooking._id || (typeof room.currentBooking === 'object' && room.currentBooking.toString)) {
        try {
          const currentBookingId = room.currentBooking._id ? room.currentBooking._id.toString() : 
                                   room.currentBooking.toString ? room.currentBooking.toString() : null;
          if (currentBookingId) {
            const bookingDoc = await Booking.findById(currentBookingId);
            if (bookingDoc && bookingDoc.status === 'cancelled') {
              currentBookingIsCancelled = true;
            }
          }
        } catch (err) {
          console.error('Error checking booking status:', err);
        }
      } else if (room.currentBooking.status === 'cancelled') {
        // Nếu currentBooking là object có status
        currentBookingIsCancelled = true;
      }
      
      // Bỏ qua nếu booking đã bị hủy
      if (currentBookingIsCancelled) {
        // Booking đã bị hủy, không cần kiểm tra conflict
      } else if (bookingId && currentBookingData) {
        // Nếu currentBooking là ObjectId, so sánh với bookingId
        const currentBookingId = room.currentBooking._id ? room.currentBooking._id.toString() : 
                                 room.currentBooking.toString ? room.currentBooking.toString() : null;
        
        // Nếu currentBooking trùng với booking đang check-in, bỏ qua conflict check
        if (currentBookingId && currentBookingId === bookingId.toString()) {
          // Đây là booking đang được check-in, bỏ qua conflict check
        } else if (room.currentBooking.checkInDate) {
          // Kiểm tra conflict với booking khác
          const bookingCheckIn = new Date(room.currentBooking.checkInDate);
          const bookingCheckOut = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
          
          if (bookingCheckOut) {
            const hasOverlap = (
              (actualCheckInTime >= bookingCheckIn && actualCheckInTime < bookingCheckOut)
            );
            
            if (hasOverlap) {
              return res.status(400).json({ 
                error: `Phòng đã được đặt từ ${bookingCheckIn.toLocaleString('vi-VN')} đến ${bookingCheckOut.toLocaleString('vi-VN')}. Vui lòng chọn thời gian khác.` 
              });
            }
          }
        }
      } else if (room.currentBooking.checkInDate) {
        // Không có bookingId, kiểm tra conflict bình thường
        const bookingCheckIn = new Date(room.currentBooking.checkInDate);
        const bookingCheckOut = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
        
        if (bookingCheckOut) {
          const hasOverlap = (
            (actualCheckInTime >= bookingCheckIn && actualCheckInTime < bookingCheckOut)
          );
          
          if (hasOverlap) {
            return res.status(400).json({ 
              error: `Phòng đã được đặt từ ${bookingCheckIn.toLocaleString('vi-VN')} đến ${bookingCheckOut.toLocaleString('vi-VN')}. Vui lòng chọn thời gian khác.` 
            });
          }
        }
      }
    }
    
    // Kiểm tra số lượng người tối đa của phòng
    const maxCapacity = room.capacity?.adults || 2; // Mặc định 2 người nếu không có capacity
    const currentGuestsCount = await getCurrentGuestsCount(room._id);
    
    // Nếu phòng đã occupied, kiểm tra số lượng người hiện tại
    if (room.status === 'occupied') {
      // Cho phép update thông tin khách nhưng không thêm khách mới nếu đã đạt giới hạn
      if (currentGuestsCount >= maxCapacity) {
        return res.status(400).json({ 
          error: `Phòng đã đạt số lượng người tối đa (${maxCapacity} người). Không thể thêm khách mới.` 
        });
      }
      // Nếu chưa đạt giới hạn, cho phép thêm khách (update thông tin)
    } else if (room.status !== 'vacant' && room.status !== 'booked') {
      // Nếu phòng không phải vacant hoặc booked, không cho phép check-in
      return res.status(400).json({ error: 'Phòng không khả dụng để check-in' });
    }
    
    // Kiểm tra số lượng người sau khi thêm khách mới
    if (currentGuestsCount + 1 > maxCapacity) {
      return res.status(400).json({ 
        error: `Phòng chỉ có thể chứa tối đa ${maxCapacity} người. Hiện tại đã có ${currentGuestsCount} người.` 
      });
    }
    
    // Cập nhật phòng
    if (room.status !== 'occupied') {
      room.status = 'occupied';
    }
    
    // Xóa currentBooking nếu có (vì đã check-in thực tế)
    if (room.currentBooking) {
      room.currentBooking = null;
    }
    
    // Đánh dấu các booking events liên quan là đã được sử dụng (nếu check-in trùng với booking)
    const bookingEventsToUpdate = await RoomEvent.find({
      roomId: room._id,
      type: 'booking',
      checkinTime: { $exists: true }
    });
    
    for (const event of bookingEventsToUpdate) {
      if (event.checkinTime) {
        const bookingCheckIn = new Date(event.checkinTime);
        // Nếu check-in trùng với booking (trong vòng 1 giờ), đánh dấu booking đã được sử dụng
        const timeDiff = Math.abs(actualCheckInTime.getTime() - bookingCheckIn.getTime());
        if (timeDiff < 60 * 60 * 1000) { // Trong vòng 1 giờ
          event.notes = (event.notes || '') + ' [Đã check-in]';
          await event.save();
        }
      }
    }
    
    // Đảm bảo checkInTime là Date object hợp lệ trước khi lưu
    const validCheckInTime = checkInTime instanceof Date && !isNaN(checkInTime.getTime()) 
      ? checkInTime 
      : new Date(checkInTime);
    
    // Log để debug
    console.log(`Saving checkin event with checkinTime: ${validCheckInTime.toISOString()}`);
    console.log('GuestInfo being saved:', {
      guestInfo: guestInfo,
      guestSource: guestInfo?.guestSource || 'not provided'
    });
    
    // Đảm bảo guestInfo có guestSource
    const guestInfoForEvent = {
      ...guestInfo,
      guestSource: guestInfo?.guestSource || 'walkin'
    };
    
    console.log('Saving to RoomEvent collection with guestInfo:', {
      guestInfo: guestInfoForEvent,
      guestSource: guestInfoForEvent.guestSource
    });
    
    // Lưu vào RoomEvent collection (không lưu vào room.events nữa)
    await saveRoomEvent(room._id, room.hotelId, {
      type: 'checkin',
      checkinTime: validCheckInTime,
      userId: customerId,
      staffId,
      guestInfo: guestInfoForEvent,
      paymentMethod,
      rateType,
      advancePayment,
      additionalCharges,
      discount,
      notes,
      selectedServices
    });
    
    // Đảm bảo guestStatus được set thành 'in' khi checkin
    room.guestStatus = 'in';
    
    await room.save();
    
    // Tạo thông báo tự động cho check-in
    const guestName = guestInfo?.name || 'Khách lẻ';
    createAutoAnnouncement('checkin', room.hotelId, room._id, room.roomNumber, guestName, {
      checkinTime: validCheckInTime
    }).catch(err => console.error('Error creating checkin announcement:', err));
    
    // Nếu có bookingId, cập nhật booking status thành 'checked_in'
    if (req.body.bookingId) {
      try {
        const existingBooking = await Booking.findById(req.body.bookingId);
        if (existingBooking) {
          existingBooking.status = 'checked_in';
          existingBooking.actualCheckInTime = checkInTime;
          existingBooking.guestDetails = {
            ...existingBooking.guestDetails,
            ...guestInfo,
            guestSource: guestInfo?.guestSource || existingBooking.guestDetails?.guestSource || 'walkin' // Đảm bảo có guestSource
          };
          if (advancePayment !== undefined) {
            existingBooking.advancePayment = advancePayment;
          }
          // Cập nhật additionalCharges và discounts vào array khi check-in
          if (additionalCharges > 0) {
            if (!existingBooking.additionalCharges) existingBooking.additionalCharges = [];
            existingBooking.additionalCharges.push({
              description: 'Phụ thu khi checkin',
              amount: additionalCharges,
              date: new Date()
            });
          }
          if (discount > 0) {
            if (!existingBooking.discounts) existingBooking.discounts = [];
            existingBooking.discounts.push({
              description: 'Khuyến mãi khi checkin',
              amount: discount,
              date: new Date()
            });
          }
          // Đảm bảo lưu booking với status mới
          await existingBooking.save({ validateBeforeSave: false });
          console.log(`Booking ${req.body.bookingId} đã được cập nhật status thành 'checked_in'`);
        } else {
          console.warn(`Không tìm thấy booking với ID: ${req.body.bookingId}`);
        }
      } catch (bookingError) {
        console.error('Error updating booking status:', bookingError);
        // Không throw error, vẫn cho phép check-in thành công
      }
    }
    
    // Tạo booking mới nếu không có bookingId
    if (!req.body.bookingId) {
      const checkOutDate = new Date(checkInTime);
      checkOutDate.setHours(checkOutDate.getHours() + 1); // Mặc định 1 giờ
      
      // Prepare booking data
      const bookingData = {
        hotelId: room.hotelId,
        roomId: room._id,
        staffId,
        checkInDate: checkInTime,
        checkOutDate,
        status: 'checked_in',
        paymentStatus: 'pending',
        rateType: rateType,
        totalAmount: room.pricing?.hourly || room.firstHourRate || 0,
        priceDetails: {
          basePrice: room.pricing?.hourly || room.firstHourRate || 0,
          firstHourPrice: room.firstHourRate
        },
        actualCheckInTime: checkInTime,
        guestDetails: {
          ...(guestInfo || { name: 'Khách lẻ' }),
          guestSource: guestInfo?.guestSource || 'walkin' // Đảm bảo có guestSource trong booking
        },
        advancePayment: advancePayment,
        additionalCharges: additionalCharges > 0 ? [{ description: 'Phụ thu khi checkin', amount: additionalCharges, date: new Date() }] : [],
        discounts: discount > 0 ? [{ description: 'Khuyến mãi khi checkin', amount: discount, date: new Date() }] : [],
        notes: notes
      };
      
      // Chỉ thêm customerId nếu có
      if (customerId) {
        bookingData.customerId = customerId;
      }
      
      // Tạo và lưu booking, bỏ qua validate
      const booking = new Booking(bookingData);
      booking.validateSync = () => {}; // Bỏ qua validate
      await booking.save({ validateBeforeSave: false });
      
      // Thêm thông tin booking vào response
      room.currentBooking = booking._id;
      await room.save();
      
      return res.status(200).json({
        message: 'Check-in thành công',
        room,
        booking
      });
    }
    
    res.status(200).json({
      message: 'Check-in thành công',
      room
    });
  } catch (error) {
    console.error('Error during check-in:', error);
    res.status(500).json({ error: 'Lỗi khi check-in' });
  }
}

// Check-out
async function checkoutRoom(req, res) {
  try {
    const { id: roomId } = req.params;
    const { 
      bookingId, 
      staffId, 
      paymentMethod,
      totalAmount: requestTotalAmount,
      remainingAmount,
      additionalCharges = 0,
      discount = 0,
      notes,
      services,
      events,
      checkoutTime: requestCheckoutTime,
      checkOutTime: requestCheckOutTime,
      createDebt = false // Flag để đánh dấu có tạo công nợ không
    } = req.body;
    const resolvedCheckoutTime = requestCheckoutTime || requestCheckOutTime;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra trạng thái phòng đang có khách
    if (room.status !== 'occupied') {
      return res.status(400).json({ error: 'Phòng không ở trạng thái đang sử dụng' });
    }
    
    // Tìm booking liên quan
    const booking = bookingId 
      ? await Booking.findById(bookingId)
      : await Booking.findOne({
          roomId,
          status: 'checked_in'
        }).sort({ createdAt: -1 });
    
    if (!booking) {
      // Nếu không tìm thấy booking, vẫn cho phép check-out nhưng không cập nhật booking
      console.log('Không tìm thấy thông tin đặt phòng, chỉ cập nhật trạng thái phòng.');
    }
    
    // Lấy timezone từ room
    const timezone = getTimezoneFromRoom(room);
    const checkOutTime = resolvedCheckoutTime ? new Date(resolvedCheckoutTime) : getTimeByTimezone(timezone);
    
    // Cập nhật phòng
    room.status = 'dirty';
    // Reset guestStatus khi checkout
    room.guestStatus = undefined;
    
    // Tìm event check-in cuối cùng CHƯA CHECKOUT từ RoomEvent collection
    let lastCheckinEvent = null;
    let checkinTime = null;
    let guestInfo = null;
    
    // Lấy từ RoomEvent collection (chưa checkout)
    lastCheckinEvent = await getLastUncheckedOutCheckinEvent(roomId);
    
    if (lastCheckinEvent) {
      checkinTime = new Date(lastCheckinEvent.checkinTime);
      guestInfo = lastCheckinEvent.guestInfo;
      console.log('Found unchecked out checkin event from RoomEvent:', {
        checkinTime: checkinTime.toISOString(),
        guestInfo: guestInfo
      });
    }
    
    // Fallback: Nếu không tìm thấy từ RoomEvent, thử lấy từ request body events
    if (!checkinTime && events && Array.isArray(events) && events.length > 0) {
      const checkinEventFromBody = events.find(e => e.type === 'checkin');
      if (checkinEventFromBody) {
        checkinTime = new Date(checkinEventFromBody.checkinTime);
        guestInfo = checkinEventFromBody.guestInfo;
        console.log('Using checkin event from request body:', {
          checkinTime: checkinTime.toISOString(),
          guestInfo: guestInfo
        });
      }
    }
    
    // Fallback: Nếu vẫn không có checkinTime, sử dụng giá trị mặc định (1 giờ trước)
    if (!checkinTime) {
      checkinTime = new Date(checkOutTime.getTime() - 3600000);
      console.warn('No checkin event found, using default (1 hour before checkout):', checkinTime.toISOString());
    }
    
    // Lấy thông tin khách hàng từ nhiều nguồn để đảm bảo có tên
    let customerName = "Khách lẻ";
    let customerPhone = null;
    let customerEmail = null;
    
    // Ưu tiên 1: Từ request body (frontend gửi lên)
    if (req.body.customerName && req.body.customerName !== "Khách lẻ") {
      customerName = req.body.customerName;
    }
    if (req.body.guestName && req.body.guestName !== "Khách lẻ") {
      customerName = req.body.guestName;
    }
    if (req.body.guestPhone) {
      customerPhone = req.body.guestPhone;
    }
    if (req.body.guestEmail) {
      customerEmail = req.body.guestEmail;
    }
    
    // Ưu tiên 2: Từ guestInfo trong lastCheckinEvent
    if (!customerName || customerName === "Khách lẻ") {
      if (guestInfo?.name) {
        customerName = guestInfo.name;
        customerPhone = guestInfo.phone || null;
        customerEmail = guestInfo.email || null;
      }
    }
    
    // Ưu tiên 3: Từ booking
    if ((!customerName || customerName === "Khách lẻ") && booking) {
      if (booking.guestDetails?.name) {
        customerName = booking.guestDetails.name;
        customerPhone = booking.guestDetails.phone || customerPhone;
        customerEmail = booking.guestDetails.email || customerEmail;
      } else if (booking.guestName) {
        customerName = booking.guestName;
      } else if (booking.customerName) {
        customerName = booking.customerName;
      }
    }
    
    // Ưu tiên 4: Từ room.currentBooking
    if ((!customerName || customerName === "Khách lẻ") && room.currentBooking) {
      const currentBooking = typeof room.currentBooking === 'object' ? room.currentBooking : null;
      if (currentBooking?.guestInfo?.name) {
        customerName = currentBooking.guestInfo.name;
        customerPhone = currentBooking.guestInfo.phone || customerPhone;
        customerEmail = currentBooking.guestInfo.email || customerEmail;
      }
    }
    
    // Lấy guestSource từ request body hoặc từ lastCheckinEvent
    let guestSource = 'walkin';
    if (req.body.guestInfo?.guestSource) {
      guestSource = req.body.guestInfo.guestSource;
    } else if (guestInfo?.guestSource) {
      guestSource = guestInfo.guestSource;
    } else if (lastCheckinEvent?.guestInfo?.guestSource) {
      guestSource = lastCheckinEvent.guestInfo.guestSource;
    }
    
    // Cập nhật guestInfo nếu chưa có
    if (!guestInfo) {
      guestInfo = {
        name: customerName,
        phone: customerPhone || '',
        email: customerEmail || '',
        idNumber: req.body.guestId || '',
        address: req.body.guestAddress || '',
        guestSource: guestSource
      };
    } else {
      // Cập nhật guestInfo với thông tin đã tìm được
      if (!guestInfo.name || guestInfo.name === "Khách lẻ") {
        guestInfo.name = customerName;
      }
      if (!guestInfo.phone && customerPhone) {
        guestInfo.phone = customerPhone;
      }
      if (!guestInfo.email && customerEmail) {
        guestInfo.email = customerEmail;
      }
      if (!guestInfo.idNumber && req.body.guestId) {
        guestInfo.idNumber = req.body.guestId;
      }
      if (!guestInfo.address && req.body.guestAddress) {
        guestInfo.address = req.body.guestAddress;
      }
      // Đảm bảo có guestSource - ưu tiên từ request body, sau đó từ lastCheckinEvent
      if (req.body.guestInfo?.guestSource) {
        guestInfo.guestSource = req.body.guestInfo.guestSource;
      } else if (!guestInfo.guestSource) {
        guestInfo.guestSource = guestSource;
      }
    }
    
    // Tính toán tiền phòng - lấy rateType từ lastCheckinEvent hoặc request body
    let rateType = lastCheckinEvent?.rateType || req.body.rateType || 'hourly';
    
    // ƯU TIÊN: Sử dụng roomTotal từ frontend nếu có (để đảm bảo đồng bộ với frontend)
    // Nếu không có, tính lại từ calculateRoomPriceHelper (từ priceConfig.js)
    let payment = 0;
    let finalRateType = rateType;
    
    if (req.body.roomTotal !== undefined && req.body.roomTotal !== null) {
      // Sử dụng roomTotal từ frontend (đã được tính chính xác theo rateType mà user chọn)
      payment = Number(req.body.roomTotal) || 0;
      // Lấy finalRateType từ request body nếu có (có thể đã được tự động chuyển đổi ở frontend)
      finalRateType = req.body.rateType || rateType;
      console.log(`Using roomTotal from frontend: ${payment}, rateType: ${finalRateType}`);
    } else {
      // Tính lại tiền phòng từ calculateRoomPriceHelper (từ priceConfig.js)
      try {
        const priceResult = await calculateRoomPriceHelper(room, checkinTime, checkOutTime, rateType);
        payment = priceResult.totalPrice;
        finalRateType = priceResult.rateType || rateType; // Sử dụng rateType cuối cùng từ priceConfig
        console.log(`Calculated payment from priceConfig: ${payment}, finalRateType: ${finalRateType}, originalRateType: ${priceResult.originalRateType || rateType}`);
      } catch (calcError) {
        console.error('Error calculating payment from priceConfig:', calcError);
        // Fallback: Tính lại tiền phòng từ calculatePayment (cách tính cũ)
        try {
          payment = await calculatePayment(checkinTime, checkOutTime, room, rateType);
          console.log(`Calculated payment from calculatePayment (fallback): ${payment}`);
        } catch (calcError2) {
          console.error('Error calculating payment (fallback):', calcError2);
          // Fallback về cách tính cũ nếu có lỗi
          if (room.firstHourRate && room.additionalHourRate) {
            const durationInHours = Math.floor((checkOutTime.getTime() - checkinTime.getTime()) / (1000 * 60 * 60));
            payment = room.firstHourRate;
            if (durationInHours > 1) {
              payment += (durationInHours - 1) * room.additionalHourRate;
            }
          } else {
            payment = room.pricing?.hourly || 0;
          }
        }
      }
    }
    
    // Tính tiền dịch vụ từ request
    let serviceTotal = 0;
    if (services && Array.isArray(services) && services.length > 0) {
      serviceTotal = services.reduce((sum, service) => {
        return sum + (service.totalPrice || (service.price * (service.quantity || 1)));
      }, 0);
    }
    
    // Cập nhật số lượng bán và tồn kho cho các dịch vụ đã sử dụng
    try {
      // Lấy service orders từ ServiceOrder collection (nếu có)
      // Chỉ lấy các orders chưa được thanh toán (paymentStatus !== 'paid' và !== 'included_in_room_charge')
      // để tránh cập nhật trùng lặp
      let serviceOrders = [];
      if (booking?._id) {
        serviceOrders = await ServiceOrder.find({
          bookingId: booking._id,
          status: { $ne: 'cancelled' },
          $or: [
            { paymentStatus: { $nin: ['paid', 'included_in_room_charge'] } },
            { paymentStatus: { $exists: false } },
            { paymentStatus: null }
          ]
        }).populate('items.serviceId');
      } else if (roomId) {
        // Fallback: tìm theo roomId nếu không có bookingId
        serviceOrders = await ServiceOrder.find({
          roomId: roomId,
          status: { $ne: 'cancelled' },
          $or: [
            { paymentStatus: { $nin: ['paid', 'included_in_room_charge'] } },
            { paymentStatus: { $exists: false } },
            { paymentStatus: null }
          ]
        }).populate('items.serviceId');
      }
      
      // Tạo map để tổng hợp số lượng theo serviceId từ service orders
      const serviceQuantityMap = new Map();
      
      // Tổng hợp từ service orders
      serviceOrders.forEach(order => {
        const items = order.items || order.services || [];
        items.forEach(item => {
          const serviceId = item.serviceId?._id || item.serviceId;
          if (serviceId) {
            const quantity = item.quantity || 0;
            const currentQuantity = serviceQuantityMap.get(serviceId.toString()) || 0;
            serviceQuantityMap.set(serviceId.toString(), currentQuantity + quantity);
          }
        });
      });
      
      // Tổng hợp từ services trong request body (nếu có serviceId)
      if (services && Array.isArray(services) && services.length > 0) {
        services.forEach(service => {
          if (service.serviceId) {
            const serviceId = service.serviceId.toString();
            const quantity = service.quantity || 0;
            const currentQuantity = serviceQuantityMap.get(serviceId) || 0;
            serviceQuantityMap.set(serviceId, currentQuantity + quantity);
          }
        });
      }
      
      // Cập nhật salesQuantity và inventory cho từng service
      for (const [serviceId, totalQuantity] of serviceQuantityMap.entries()) {
        if (totalQuantity <= 0) continue; // Bỏ qua nếu số lượng <= 0
        
        try {
          const service = await Service.findById(serviceId);
          if (service) {
            // Tăng salesQuantity
            service.salesQuantity = (service.salesQuantity || 0) + totalQuantity;
            
            // Cập nhật inventory = importQuantity - salesQuantity
            const importQty = service.importQuantity || 0;
            const salesQty = service.salesQuantity || 0;
            service.inventory = Math.max(0, importQty - salesQty);
            
            await service.save();
            console.log(`Updated service ${serviceId} (${service.name}): salesQuantity=${service.salesQuantity}, inventory=${service.inventory}, added quantity=${totalQuantity}`);
          }
        } catch (serviceError) {
          console.error(`Error updating service ${serviceId}:`, serviceError);
          // Không throw lỗi, tiếp tục với các service khác
        }
      }
      
      // Cập nhật paymentStatus của service orders thành 'included_in_room_charge' để đánh dấu đã xử lý
      if (serviceOrders.length > 0) {
        const orderIds = serviceOrders.map(order => order._id);
        await ServiceOrder.updateMany(
          { _id: { $in: orderIds } },
          { 
            $set: { 
              paymentStatus: 'included_in_room_charge',
              status: 'delivered' // Đánh dấu đã giao hàng
            } 
          }
        );
        console.log(`Updated ${orderIds.length} service orders payment status to 'included_in_room_charge'`);
      }
    } catch (serviceUpdateError) {
      console.error('Error updating service quantities during checkout:', serviceUpdateError);
      // Không throw lỗi, vẫn tiếp tục checkout
    }
    
    // Tính tiền phòng (không bao gồm dịch vụ)
    // Sử dụng payment đã được xác định ở trên (từ frontend hoặc tính lại)
    const roomTotal = payment;
    
    // ƯU TIÊN: Sử dụng totalAmount từ frontend nếu có (để đảm bảo đồng bộ)
    // Nếu không có, mới tính lại
    let totalAmount = 0;
    if (req.body.totalAmount !== undefined && req.body.totalAmount !== null) {
      // Sử dụng totalAmount từ frontend (đã bao gồm room + services + charges - discount)
      totalAmount = Number(req.body.totalAmount) || 0;
      console.log(`Using totalAmount from frontend: ${totalAmount}`);
    } else {
      // Fallback: Tính lại totalAmount
      totalAmount = roomTotal + serviceTotal + additionalCharges - discount;
      console.log(`Calculated totalAmount from backend: ${totalAmount} = ${roomTotal} + ${serviceTotal} + ${additionalCharges} - ${discount}`);
    }
    
    // Lấy advancePayment từ lastCheckinEvent hoặc request body (PHẢI ĐẶT TRƯỚC KHI SỬ DỤNG)
    const advancePayment = lastCheckinEvent?.advancePayment || req.body.advancePayment || 0;
    
    // Xác định phương thức thanh toán cho tiền đặt trước
    const advancePaymentMethod = lastCheckinEvent?.advancePaymentMethod || req.body.advancePaymentMethod || paymentMethod || 'cash';
    
    // Đảm bảo guestInfo có đầy đủ thông tin, bao gồm guestSource
    const completeGuestInfo = {
      name: guestInfo.name || customerName || 'Khách lẻ',
      phone: guestInfo.phone || customerPhone || '',
      email: guestInfo.email || customerEmail || '',
      idNumber: guestInfo.idNumber || '',
      address: guestInfo.address || '',
      guestSource: guestInfo.guestSource || guestSource || 'walkin' // Đảm bảo có guestSource
    };
    
    console.log('Saving checkout event to RoomEvent with guestInfo:', {
      guestInfo: completeGuestInfo,
      guestSource: completeGuestInfo.guestSource
    });
    
    // Đảm bảo checkinTime là Date object hợp lệ để so sánh chính xác
    const validCheckinTime = checkinTime instanceof Date && !isNaN(checkinTime.getTime()) 
      ? checkinTime 
      : new Date(checkinTime);
    
    // Lấy paymentStatus từ request body (mặc định 'paid' nếu không có)
    // Lấy paymentStatus từ request body
    // Nếu createDebt = true, thì paymentStatus = 'pending' (chưa thanh toán)
    // Ngược lại, mặc định là 'paid'
    const paymentStatus = createDebt ? 'pending' : (req.body.paymentStatus || 'paid');
    
    // Lấy selectedServices từ lastCheckinEvent để lưu vào checkout event
    const selectedServices = lastCheckinEvent?.selectedServices || [];
    
    // Lấy expectedCheckoutTime từ lastCheckinEvent để lưu vào checkout event
    const expectedCheckoutTime = lastCheckinEvent?.expectedCheckoutTime || null;
    
    const normalizedPaymentMethod = mapRoomPaymentMethod(paymentMethod);
    let finalPaymentStatus = paymentStatus;
    if (normalizedPaymentMethod === 'transfer') {
      const hotelDoc = await Hotel.findById(room.hotelId).lean();
      const enabled = hotelDoc?.settings?.enableQRPaymentForBankTransfer === true;
      if (enabled) {
        const qrInfo = await getHotelOrBusinessQRCode(hotelDoc);
        if (qrInfo && qrInfo.qrPaymentUrl) {
          finalPaymentStatus = 'pending';
        } else {
          finalPaymentStatus = 'paid';
        }
      }
    }
    
    // Lưu event checkout vào RoomEvent collection (mới)
    // QUAN TRỌNG: checkinTime phải khớp chính xác với checkinTime của event check-in để có thể tìm được
    // Lưu invoiceId vào checkout event để có thể xóa sau này
    const checkoutEventData = {
      type: 'checkout',
      checkoutTime: checkOutTime,
      checkinTime: validCheckinTime, // Sử dụng checkinTime đã validate để đảm bảo khớp với event check-in
      expectedCheckoutTime: expectedCheckoutTime, // Lưu expectedCheckoutTime từ checkin event
      payment: payment,
      totalAmount: totalAmount,
      staffId: staffId,
      guestInfo: completeGuestInfo, // Sử dụng completeGuestInfo với đầy đủ thông tin (bao gồm guestSource)
      paymentMethod: normalizedPaymentMethod || 'cash',
      paymentStatus: finalPaymentStatus,
      rateType: finalRateType, // Lưu rateType cuối cùng (có thể đã được tự động chuyển đổi từ priceConfig)
      advancePayment: advancePayment, // Lưu advancePayment (đã được khai báo ở trên)
      advancePaymentMethod: advancePaymentMethod,
      additionalCharges: additionalCharges, // Lưu additionalCharges
      discount: discount, // Lưu discount
      selectedServices: selectedServices, // Lưu selectedServices từ checkin event để có thể khôi phục khi recheckin
      notes: notes // Lưu notes nếu có
    };
    
    await saveRoomEvent(room._id, room.hotelId, checkoutEventData);
    
    console.log('Saved checkout event with checkinTime:', validCheckinTime.toISOString());

    cleanupRoomEvents(room._id, 10).catch(err => {
      console.error('Error running cleanupRoomEvents:', err);
    });
    
    // Cập nhật lịch sử phòng
    if (!room.bookingHistory) {
      room.bookingHistory = [];
    }
    
    // advancePayment đã được khai báo ở trên (sau serviceTotal), không cần khai báo lại
    
    // Tạo số hóa đơn
    const invoiceNumber = `INV-${checkOutTime.getTime()}`;
    
    // Tính duration
    const durationInMilliseconds = checkOutTime.getTime() - checkinTime.getTime();
    const durationInHours = Math.floor(durationInMilliseconds / (1000 * 60 * 60));
    const durationInDays = Math.ceil(durationInHours / 24);
    
    // Tạo products từ room và services
    const products = [];
    // Thêm tiền phòng vào products
    products.push({
      name: `Tiền phòng ${room.roomNumber}`,
      price: roomTotal,
      quantity: 1,
      totalPrice: roomTotal
    });
    
    // Thêm các dịch vụ vào products
    if (services && Array.isArray(services) && services.length > 0) {
      services.forEach(service => {
        const serviceTotal = service.totalPrice || (service.price * (service.quantity || 1));
        products.push({
          name: service.serviceName || service.name || 'Dịch vụ',
          price: service.price || 0,
          quantity: service.quantity || 1,
          totalPrice: serviceTotal
        });
      });
    }
    
    // Lấy paymentTransactionId từ request body (nếu có, từ SePay)
    const paymentTransactionId = req.body.paymentTransactionId || null;
    
    // Tạo invoice và lưu vào Invoice model
    const invoiceData = {
      invoiceNumber: invoiceNumber,
      hotelId: room.hotelId,
      roomId: room._id,
      roomNumber: room.roomNumber,
      roomType: room.type,
      bookingId: booking?._id || null,
      customerName: customerName,
      customerPhone: customerPhone || completeGuestInfo.phone || null,
      customerEmail: customerEmail || completeGuestInfo.email || null,
      customerId: booking?.customerId || null,
      guestInfo: completeGuestInfo,
      guestDetails: completeGuestInfo,
      guestSource: completeGuestInfo.guestSource || guestSource || 'walkin',
      staffId: staffId,
      staffName: req.body.staffName || "Nhân viên",
      checkInTime: checkinTime,
      checkOutTime: checkOutTime,
      duration: {
        hours: durationInHours,
        days: durationInDays
      },
      rateType: finalRateType,
      products: products,
      services: services || [],
      roomAmount: roomTotal,
      roomTotal: roomTotal,
      roomPrice: roomTotal,
      serviceAmount: serviceTotal,
      servicesTotal: serviceTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      advancePayment: advancePayment,
      remainingAmount: remainingAmount || (totalAmount - advancePayment),
      totalAmount: totalAmount,
      paymentMethod: normalizedPaymentMethod || 'cash',
      paymentStatus: finalPaymentStatus,
      paymentTransactionId: paymentTransactionId,
      notes: notes,
      status: finalPaymentStatus === 'paid' ? 'paid' : 'issued'
    };
    
    // Lưu invoice vào Invoice model
    let savedInvoice = null;
    try {
      const newInvoice = new Invoice(invoiceData);
      savedInvoice = await newInvoice.save();
      console.log('Invoice saved to Invoice model:', savedInvoice._id);

      // Tự tạo phiếu thu khi checkout (nếu đã thanh toán)
      // - Không tạo khi pending (QR transfer) hoặc createDebt
      // - Không tạo khi số tiền còn lại <= 0
      const amountToCollect = Number(savedInvoice.remainingAmount || 0);
      if (finalPaymentStatus === 'paid' && amountToCollect > 0) {
        const existing = await Transaction.findOne({
          hotelId: new mongoose.Types.ObjectId(room.hotelId),
          type: 'income',
          invoiceNumber: invoiceNumber,
          'metadata.source': 'room_checkout'
        }).lean();

        if (!existing) {
          const tx = new Transaction({
            hotelId: new mongoose.Types.ObjectId(room.hotelId),
            bookingId: booking?._id || undefined,
            staffId: staffId && mongoose.Types.ObjectId.isValid(staffId) ? new mongoose.Types.ObjectId(staffId) : undefined,
            type: 'income',
            incomeCategory: 'room',
            amount: amountToCollect,
            method: mapTransactionMethodFromRoomPaymentMethod(normalizedPaymentMethod),
            status: 'completed',
            description: `Thu tiền phòng ${room.roomNumber} (checkout)`,
            notes: notes || '',
            invoiceNumber: invoiceNumber,
            processedBy: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
            processedAt: new Date(),
            metadata: {
              source: 'room_checkout',
              roomId: String(room._id),
              bookingId: booking?._id ? String(booking._id) : null,
              invoiceId: String(savedInvoice._id),
              invoiceNumber: invoiceNumber
            }
          });
          await tx.save();
          await deleteCachePattern(`transactions:income:${String(room.hotelId)}:*`);
        }
      }
      
      // Cập nhật checkout event với invoiceId
      if (savedInvoice._id) {
        try {
          await RoomEvent.updateOne(
            {
              roomId: room._id,
              type: 'checkout',
              checkoutTime: checkOutTime,
              checkinTime: validCheckinTime
            },
            {
              $set: { invoiceId: savedInvoice._id }
            }
          );
        } catch (eventUpdateError) {
          console.error('Error updating checkout event with invoiceId:', eventUpdateError);
        }
      }
    } catch (invoiceError) {
      console.error('Error saving invoice to Invoice model:', invoiceError);
      // Không throw lỗi, vẫn tiếp tục checkout
    }
    
    // Vẫn giữ bookingHistory để backward compatibility (nhưng không còn là nguồn dữ liệu chính)
    room.bookingHistory.push({
      event: 'check-out',
      date: checkOutTime,
      checkInTime: checkinTime,
      checkOutTime: checkOutTime,
      guestInfo: completeGuestInfo || {},
      customerName: customerName,
      customerPhone: customerPhone || completeGuestInfo?.phone || null,
      customerId: booking?.customerId || null,
      staffId: staffId,
      staffName: "Nhân viên",
      amount: payment,
      roomTotal: roomTotal,
      servicesTotal: serviceTotal,
      additionalCharges: additionalCharges,
      discount: discount,
      advancePayment: advancePayment,
      advancePaymentMethod: advancePaymentMethod,
      totalAmount: totalAmount,
      paymentMethod: normalizedPaymentMethod || 'cash',
      paymentStatus: finalPaymentStatus,
      rateType: finalRateType,
      services: services || [],
      invoiceNumber: invoiceNumber,
      invoiceId: savedInvoice?._id || null, // Thêm invoiceId để liên kết với Invoice model
      notes: notes,
      guestSource: completeGuestInfo?.guestSource || guestSource || 'walkin' // Đảm bảo có guestSource
    });
    
    // Cập nhật doanh thu phòng (giữ lại để backward compatibility, nhưng invoice là nguồn dữ liệu chính)
    if (!room.revenue) {
      room.revenue = { total: 0, history: [] };
    }
    
    room.revenue.total = (room.revenue.total || 0) + totalAmount;
    room.revenue.history.push({
      date: checkOutTime,
      amount: totalAmount,
      bookingId: booking?._id || null,
      invoiceId: savedInvoice?._id || null // Thêm invoiceId để liên kết
    });
    
    // Xóa currentBooking
    room.currentBooking = null;
    
    // Nếu có booking, cập nhật booking
    if (booking) {
      booking.checkOutDate = checkOutTime;
      booking.actualCheckOutDate = checkOutTime;
      booking.status = 'checked_out';
      booking.totalAmount = totalAmount;
      
      // additionalCharges và discounts là arrays embedded documents trong Booking model
      if (additionalCharges > 0) {
        if (!booking.additionalCharges) booking.additionalCharges = [];
        booking.additionalCharges.push({
          description: 'Phụ thu khi checkout',
          amount: additionalCharges,
          date: new Date()
        });
      }
      
      if (discount > 0) {
        if (!booking.discounts) booking.discounts = [];
        booking.discounts.push({
          description: 'Khuyến mãi khi checkout',
          amount: discount,
          date: new Date()
        });
      }
      
      booking.paymentDetails = {
        roomNumber: room.roomNumber,
        amount: totalAmount,
        checkInTime: booking.actualCheckInTime || booking.checkInDate || checkinTime,
        checkOutTime,
        paymentMethod: normalizedPaymentMethod || 'cash',
        paymentDate: new Date()
      };
      
      booking.paymentStatus = finalPaymentStatus;
      
      await booking.save({ validateBeforeSave: false }); // Bỏ qua validate để tránh lỗi basePrice
      
      // Cập nhật doanh thu khách sạn
      try {
        const hotel = await Hotel.findById(room.hotelId);
        if (hotel) {
          if (!hotel.revenue) {
            hotel.revenue = { daily: 0, total: 0, history: [] };
          }
          hotel.revenue.daily = (hotel.revenue.daily || 0) + totalAmount;
          hotel.revenue.total = (hotel.revenue.total || 0) + totalAmount;
          if (!hotel.revenue.history) {
            hotel.revenue.history = [];
          }
          hotel.revenue.history.push({
            date: checkOutTime,
            amount: totalAmount,
            source: 'room'
          });
          await hotel.save();
        }
      } catch (hotelError) {
        console.error('Error updating hotel revenue:', hotelError);
        // Không throw lỗi, tiếp tục checkout
      }
    }
    
    await room.save();
    
    // Tạo thông báo tự động cho check-out
    const guestName = customerName || completeGuestInfo?.name || 'Khách lẻ';
    createAutoAnnouncement('checkout', room.hotelId, room._id, room.roomNumber, guestName, {
      checkoutTime: checkOutTime,
      totalAmount: totalAmount
    }).catch(err => console.error('Error creating checkout announcement:', err));
    
    // Tạo công nợ nếu được yêu cầu
    let createdDebt = null;
    if (createDebt && savedInvoice) {
      try {
        const debtAmount = totalAmount - (advancePayment || 0);
        if (debtAmount > 0) {
          const debt = new Debt({
            hotelId: room.hotelId,
            invoiceId: savedInvoice._id,
            invoiceNumber: savedInvoice.invoiceNumber,
            roomId: room._id,
            roomNumber: room.roomNumber,
            bookingId: booking?._id || null,
            customerName: customerName,
            customerPhone: customerPhone || completeGuestInfo.phone || null,
            customerEmail: customerEmail || completeGuestInfo.email || null,
            customerId: booking?.customerId || null,
            guestInfo: completeGuestInfo,
            createdByStaffId: staffId,
            createdByStaffName: req.body.staffName || "Nhân viên",
            debtAmount: debtAmount,
            paidAmount: 0,
            remainingAmount: debtAmount,
            status: 'pending',
            debtDate: checkOutTime,
            notes: notes || 'Công nợ từ checkout'
          });
          createdDebt = await debt.save();
          console.log(`Created debt ${createdDebt._id} for invoice ${savedInvoice._id}`);
        }
      } catch (debtError) {
        console.error('Error creating debt during checkout:', debtError);
        // Không throw lỗi, vẫn tiếp tục checkout
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Check-out thành công',
      room,
      booking: booking || null,
      totalAmount: totalAmount,
      invoice: savedInvoice || null, // Trả về invoice đã lưu
      invoiceId: savedInvoice?._id || null,
      debt: createdDebt || null // Trả về debt nếu có
    });
  } catch (error) {
    console.error('Error checking out room:', error);
    res.status(500).json({ 
      success: false,
      error: 'Lỗi khi check-out phòng: ' + error.message 
    });
  }
}

// Dọn phòng
async function cleanRoom(req, res) {
  try {
    const id = req.params.id;
    const { staffId, type } = req.body;
    
    if (!id) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
 
    const room = await Room.findById(id);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra trạng thái phòng
    if (room.status !== 'dirty' && room.status !== 'maintenance' && room.status !== 'cleaning') {
      return res.status(400).json({ 
        error: 'Phòng không ở trạng thái cần dọn dẹp hoặc bảo trì' 
      });
    }
    
    // Lưu trạng thái cũ trước khi thay đổi
    const previousStatus = room.status;
    room.status = 'vacant';
    // Reset guestStatus khi phòng chuyển sang vacant
    room.guestStatus = null;
    
    // Tạo event khi dọn phòng hoặc hoàn thành bảo trì
    const eventNote = previousStatus === 'maintenance' ? 'Đã hoàn thành bảo trì' : 'Đã dọn dẹp phòng';
    
    const eventData = {
      type: 'maintenance',
      notes: req.body.notes || eventNote,
      createdAt: new Date()
    };
    
    if (staffId) {
      eventData.staffId = staffId;
    }
    
    // Lưu event vào RoomEvent collection và room document
    await saveEventToBoth(room, eventData);
    
    // Ghi lại lịch sử vào bookingHistory
    if (!room.bookingHistory) {
      room.bookingHistory = [];
    }
    
    room.bookingHistory.push({
      event: 'maintenance',
      date: new Date(),
      staffId,
      notes: req.body.notes || eventNote
    });
    
    const updatedRoom = await room.save();
    
    // Tạo thông báo tự động cho dọn phòng
    createAutoAnnouncement('maintenance', room.hotelId, room._id, room.roomNumber, '', {
      isCompleted: true,
      notes: req.body.notes || eventNote
    }).catch(err => console.error('Error creating maintenance announcement:', err));
    
    const successMessage = previousStatus === 'maintenance' 
      ? 'Phòng đã được hoàn thành bảo trì và sẵn sàng sử dụng'
      : 'Phòng đã được dọn dẹp và sẵn sàng sử dụng';
      
    res.status(200).json({
      message: successMessage,
      room: updatedRoom
    });
  } catch (error) {
    console.error('Error during clean room:', error);
    res.status(500).json({ error: 'Lỗi khi dọn phòng', details: error.message });
  }
}

// Gán dịch vụ cho phòng
async function assignServiceToRoom(req, res) {
  try {
    const { roomId, serviceId } = req.params;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Không tìm thấy dịch vụ' });
    }
    
    // Kiểm tra xem dịch vụ đã được gán cho phòng chưa
    if (room.services.includes(serviceId)) {
      return res.status(400).json({ error: 'Dịch vụ đã được gán cho phòng này' });
    }
    
    room.services.push(serviceId);
    await room.save();
    
    res.status(200).json({
      message: 'Đã gán dịch vụ cho phòng thành công',
      room
    });
  } catch (error) {
    console.error('Error assigning service to room:', error);
    res.status(500).json({ error: 'Lỗi khi gán dịch vụ cho phòng' });
  }
}

// Xóa dịch vụ khỏi phòng
async function removeServiceFromRoom(req, res) {
  try {
    const { roomId, serviceId } = req.params;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra xem dịch vụ có được gán cho phòng không
    if (!room.services.includes(serviceId)) {
      return res.status(400).json({ error: 'Dịch vụ không được gán cho phòng này' });
    }
    
    room.services = room.services.filter(id => id.toString() !== serviceId);
    await room.save();
    
    res.status(200).json({
      message: 'Đã xóa dịch vụ khỏi phòng thành công',
      room
    });
  } catch (error) {
    console.error('Error removing service from room:', error);
    res.status(500).json({ error: 'Lỗi khi xóa dịch vụ khỏi phòng' });
  }
}

// Tính giá phòng - ƯU TIÊN priceConfig trước
async function calculatePayment(checkinTime, checkoutTime, room, rateType = 'hourly') {
  if (!checkinTime || !checkoutTime) {
    return 0;
  }
  
  // Tính thời gian chính xác theo phút
  const durationInMilliseconds = checkoutTime.getTime() - checkinTime.getTime();
  const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
  const durationInHours = Math.floor(durationInMinutes / 60);
  const remainingMinutes = durationInMinutes % 60;
  
  // Lấy giờ check-in
  const checkInHour = checkinTime.getHours();
  
  // ========== ƯU TIÊN 1: Tìm priceConfig từ room.priceConfigId ==========
  let priceConfig = null;
  if (room.priceConfigId) {
    try {
      // Nếu priceConfigId là ObjectId, populate nó
      if (typeof room.priceConfigId === 'object' && room.priceConfigId._id) {
        priceConfig = await PriceConfig.findById(room.priceConfigId._id);
      } else {
        priceConfig = await PriceConfig.findById(room.priceConfigId);
      }
    } catch (err) {
      console.error('Error loading priceConfig:', err);
    }
  }
  
  // ========== ƯU TIÊN 2: Tìm priceConfig theo roomType nếu chưa có ==========
  if (!priceConfig && room.hotelId && room.type) {
    try {
      priceConfig = await PriceConfig.findOne({
        hotelId: room.hotelId,
        roomTypeId: room.type,
        isActive: true,
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: null },
          { effectiveTo: { $gte: new Date() } }
        ]
      }).sort({ effectiveFrom: -1 }); // Lấy config mới nhất
    } catch (err) {
      console.error('Error finding priceConfig by roomType:', err);
    }
  }
  
  let totalPrice = 0;
  
  // ========== NẾU CÓ priceConfig: ƯU TIÊN SỬ DỤNG GIÁ TỪ priceConfig ==========
  if (priceConfig) {
    // ƯU TIÊN: Sử dụng rateType từ user, KHÔNG tự động chuyển đổi
    // Nếu user chọn hourly, luôn tính theo giờ, không tự động chuyển sang nightly
    let finalRateType = rateType || 'hourly';
    
    // Chỉ tự động chuyển sang daily nếu quá maxHoursBeforeDay (không chuyển sang nightly)
    if (finalRateType === 'hourly') {
      const maxHoursBeforeDay = priceConfig.hourlyRates?.maxHoursBeforeDay || 6;
      
      // Nếu quá số giờ tối đa trước khi chuyển sang ngày
      if (durationInHours > maxHoursBeforeDay) {
        finalRateType = 'daily';
      }
      // KHÔNG tự động chuyển sang nightly khi chọn hourly
    }
    
    // Helper function để parse time string (HH:mm) thành giờ và phút
    const parseTime = (timeStr) => {
      const parts = timeStr.split(':');
      return {
        hour: parseInt(parts[0]) || 0,
        minute: parseInt(parts[1]) || 0
      };
    };
    
    // Helper function để tính số giờ sớm/trễ
    const calculateEarlyHours = (actualTime, standardTime) => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes < standardMinutes) {
        return Math.ceil((standardMinutes - actualMinutes) / 60); // Làm tròn lên
      }
      return 0;
    };
    
    const calculateLateHours = (actualTime, standardTime) => {
      const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
      const standard = parseTime(standardTime);
      const actualMinutes = actual.hour * 60 + actual.minute;
      const standardMinutes = standard.hour * 60 + standard.minute;
      if (actualMinutes > standardMinutes) {
        return Math.ceil((actualMinutes - standardMinutes) / 60); // Làm tròn lên
      }
      return 0;
    };
    
    // Sử dụng finalRateType để tính giá
    switch (finalRateType) {
      case 'hourly':
        // Tính giá giờ đầu
        totalPrice = priceConfig.hourlyRates?.firstHourPrice || 0;
        
        // Tính giá cho các giờ tiếp theo
        if (durationInHours >= 1) {
          const gracePeriodMinutes = priceConfig.hourlyRates?.gracePeriodMinutes || 15;
          let billableHours = durationInHours - 1; // Số giờ tính phí (trừ giờ đầu)
          
          // Nếu có thời gian dư sau giờ thứ 2
          if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
            // Quá grace period, tính thêm 1 giờ
            billableHours += 1;
          } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
            // Nếu chỉ có 1 giờ nhưng quá 15 phút, tính thêm 1 giờ
            billableHours = 1;
          }
          
          if (billableHours > 0) {
            totalPrice += billableHours * (priceConfig.hourlyRates?.additionalHourPrice || 0);
          }
        }
        
        // Chuyển sang tính giá ngày nếu vượt quá số giờ tối đa
        const maxHoursBeforeDay = priceConfig.hourlyRates?.maxHoursBeforeDay || 6;
        if (durationInHours > maxHoursBeforeDay) {
          totalPrice = priceConfig.dailyRates?.standardPrice || totalPrice;
        }
        break;
        
      case 'daily':
        // Tính số ngày dựa trên ngày thực tế (qua đêm), không làm tròn từ giờ
        // Ví dụ: check-in 14:00 ngày 1, check-out 12:00 ngày 2 → 1 ngày
        // check-in 14:00 ngày 1, check-out 18:00 ngày 1 → 0 ngày (nên tính theo giờ)
        const checkInDate = new Date(checkinTime);
        checkInDate.setHours(0, 0, 0, 0);
        const checkOutDate = new Date(checkoutTime);
        checkOutDate.setHours(0, 0, 0, 0);
        const actualDays = Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Nếu check-in và check-out cùng ngày, tính tối thiểu 1 ngày
        const durationInDays = actualDays;
        totalPrice = durationInDays * (priceConfig.dailyRates?.standardPrice || 0);
        
        // Thời gian quy định cho ngày đêm: 12:00 - 12:00 ngày hôm sau
        // CHỈ tính phụ thu early check-in nếu check-in TRƯỚC thời gian daily (trước 12:00)
        // Nếu check-in trong thời gian daily (sau 12:00), KHÔNG tính early check-in surcharge
        const dailyStartTime = '12:00'; // Thời gian bắt đầu nhận ngày đêm
        const dailyCheckOutTime = priceConfig.dailyRates?.checkOutTime || '12:00';
        
        // Kiểm tra xem check-in có trong thời gian daily không (sau dailyStartTime)
        const checkInMinutes = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHour, startMinute] = dailyStartTime.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const isInDailyTime = checkInMinutes >= startTimeMinutes;
        
        // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian daily (trước dailyStartTime)
        if (!isInDailyTime) {
          const earlyCheckinHours = calculateEarlyHours(checkinTime, dailyStartTime);
          if (earlyCheckinHours > 0) {
            // Ưu tiên lấy từ priceConfig, fallback về room.priceSettings
            const earlyCheckinSurcharge = priceConfig.dailyRates?.earlyCheckinSurcharge || 
                                          room.priceSettings?.dailyEarlyCheckinSurcharge || 0;
            totalPrice += earlyCheckinHours * earlyCheckinSurcharge;
            console.log(`Daily early check-in: ${earlyCheckinHours} hours, surcharge: ${earlyCheckinHours * earlyCheckinSurcharge}`);
          }
        } else {
          console.log(`Daily check-in trong thời gian quy định (sau ${dailyStartTime}), không tính early check-in surcharge`);
        }
        
        // Tính phụ thu check-out trễ (nếu check-out sau 12:00 ngày hôm sau)
        const isNextDayForDaily = checkOutDate.getTime() > checkInDate.getTime();
        const checkOutMinutesForDaily = checkoutTime.getHours() * 60 + checkoutTime.getMinutes();
        const [dailyCheckOutHour, dailyCheckOutMinute] = dailyCheckOutTime.split(':').map(Number);
        const dailyCheckOutMinutes = dailyCheckOutHour * 60 + dailyCheckOutMinute;
        
        if (isNextDayForDaily && checkOutMinutesForDaily > dailyCheckOutMinutes) {
          // Check-out sau 12:00 ngày hôm sau
          const lateMinutes = checkOutMinutesForDaily - dailyCheckOutMinutes;
          const lateCheckoutHours = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const lateCheckoutFee = priceConfig.dailyRates?.latecheckOutFee || 
                                  room.priceSettings?.dailyLateCheckoutFee || 0;
          totalPrice += lateCheckoutHours * lateCheckoutFee;
          console.log(`Daily late check-out: ${lateCheckoutHours} hours, fee: ${lateCheckoutHours * lateCheckoutFee}`);
        } else if (!isNextDayForDaily && checkOutMinutesForDaily > dailyCheckOutMinutes) {
          // Check-out cùng ngày nhưng sau 12:00 (trường hợp đặc biệt)
          const lateMinutes = checkOutMinutesForDaily - dailyCheckOutMinutes;
          const lateCheckoutHours = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const lateCheckoutFee = priceConfig.dailyRates?.latecheckOutFee || 
                                  room.priceSettings?.dailyLateCheckoutFee || 0;
          totalPrice += lateCheckoutHours * lateCheckoutFee;
          console.log(`Daily late check-out (same day): ${lateCheckoutHours} hours, fee: ${lateCheckoutHours * lateCheckoutFee}`);
        }
        break;
        
      case 'nightly':
        // Tính số đêm dựa trên đêm thực tế (qua đêm), không làm tròn từ giờ
        // Ví dụ: check-in 20:00 ngày 1, check-out 10:00 ngày 2 → 1 đêm
        // check-in 20:00 ngày 1, check-out 10:00 ngày 3 → 2 đêm
        const nightlyCheckInDate = new Date(checkinTime);
        nightlyCheckInDate.setHours(0, 0, 0, 0);
        const nightlyCheckOutDate = new Date(checkoutTime);
        nightlyCheckOutDate.setHours(0, 0, 0, 0);
        const actualNights = Math.max(1, Math.ceil((nightlyCheckOutDate.getTime() - nightlyCheckInDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Nếu check-in và check-out cùng ngày, tính tối thiểu 1 đêm
        const durationInNights = actualNights;
        totalPrice = durationInNights * (priceConfig.nightlyRates?.standardPrice || 0);
        
        // Tính phụ thu check-in sớm CHỈ NẾU check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
        // Thời gian quy định qua đêm: 20:00 - 12:00 ngày hôm sau
        // Nếu check-in trong thời gian này (sau 20:00 hoặc trước 12:00 ngày hôm sau), KHÔNG tính early check-in surcharge
        const nightlyStartTime = priceConfig.nightlyRates?.startTime || '20:00';
        const nightlyEndTime = priceConfig.nightlyRates?.endTime || '12:00';
        
        // Kiểm tra xem check-in có trong thời gian nightly không
        const checkInMinutesNightly = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHourNightly, startMinuteNightly] = nightlyStartTime.split(':').map(Number);
        const startTimeMinutesNightly = startHourNightly * 60 + startMinuteNightly;
        const [endHourNightly, endMinuteNightly] = nightlyEndTime.split(':').map(Number);
        const endTimeMinutesNightly = endHourNightly * 60 + endMinuteNightly;
        
        // Thời gian nightly: từ nightlyStartTime (ví dụ 20:00) đến nightlyEndTime ngày hôm sau (ví dụ 12:00)
        const isInNightlyTime = checkInMinutesNightly >= startTimeMinutesNightly || checkInMinutesNightly <= endTimeMinutesNightly;
        
        // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
        if (!isInNightlyTime) {
          const earlyCheckinHoursNightly = calculateEarlyHours(checkinTime, nightlyStartTime);
          if (earlyCheckinHoursNightly > 0) {
            // Ưu tiên lấy từ priceConfig, fallback về room.priceSettings
            const earlyCheckinSurchargeNightly = priceConfig.nightlyRates?.earlyCheckinSurcharge || 
                                                  room.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
            totalPrice += earlyCheckinHoursNightly * earlyCheckinSurchargeNightly;
            console.log(`Nightly early check-in: ${earlyCheckinHoursNightly} hours, surcharge: ${earlyCheckinHoursNightly * earlyCheckinSurchargeNightly}`);
          }
        } else {
          console.log(`Nightly check-in trong thời gian quy định (${nightlyStartTime}-${nightlyEndTime}), không tính early check-in surcharge`);
        }
        
        // Tính phụ thu check-out trễ (nếu check-out sau 12:00 ngày hôm sau)
        // Sử dụng nightlyEndTime đã khai báo ở trên (dòng 2440)
        const isNextDayForNightly = nightlyCheckOutDate.getTime() > nightlyCheckInDate.getTime();
        const checkOutMinutesForNightly = checkoutTime.getHours() * 60 + checkoutTime.getMinutes();
        // Sử dụng lại nightlyEndTime đã khai báo ở trên
        const [nightlyEndHourForCheckout, nightlyEndMinuteForCheckout] = nightlyEndTime.split(':').map(Number);
        const nightlyEndMinutes = nightlyEndHourForCheckout * 60 + nightlyEndMinuteForCheckout;
        
        if (isNextDayForNightly && checkOutMinutesForNightly > nightlyEndMinutes) {
          // Check-out sau 12:00 ngày hôm sau
          const lateMinutes = checkOutMinutesForNightly - nightlyEndMinutes;
          const lateCheckoutHoursNightly = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const lateCheckoutSurchargeNightly = priceConfig.nightlyRates?.lateCheckoutSurcharge || 
                                               room.priceSettings?.nightlyLateCheckoutSurcharge || 0;
          totalPrice += lateCheckoutHoursNightly * lateCheckoutSurchargeNightly;
          console.log(`Nightly late check-out: ${lateCheckoutHoursNightly} hours, surcharge: ${lateCheckoutHoursNightly * lateCheckoutSurchargeNightly}`);
        }
        break;
        
      default:
        // Mặc định tính theo giờ từ priceConfig
        totalPrice = priceConfig.hourlyRates?.firstHourPrice || 0;
        if (durationInHours > 1) {
          const gracePeriodMinutes = priceConfig.hourlyRates?.gracePeriodMinutes || 15;
          let billableHours = durationInHours - 1;
          if (remainingMinutes > gracePeriodMinutes) {
            billableHours += 1;
          }
          if (billableHours > 0) {
            totalPrice += billableHours * (priceConfig.hourlyRates?.additionalHourPrice || 0);
          }
        }
    }
  } else {
    // ========== FALLBACK: Chỉ sử dụng giá từ room nếu KHÔNG CÓ priceConfig ==========
    const nightlyStartTime = room.priceSettings?.nightlyStartTime || '22:00';
    const checkOutHourLimit = parseInt(nightlyStartTime.split(':')[0]) || 22;
    const gracePeriodMinutes = room.priceSettings?.gracePeriodMinutes || 15;
    const autoNightlyHours = room.priceSettings?.autoNightlyHours || 8;
    
    const hourlyRate = room.pricing?.hourly || 0;
    const dailyRate = room.pricing?.daily || 0;
    const nightlyRate = room.pricing?.nightly || 0;
    
    // Trường hợp check-in sau 22h thì áp dụng giá qua đêm
    if (checkInHour >= checkOutHourLimit && rateType === 'nightly') {
      return nightlyRate;
    }
    
    // Xử lý dựa trên giá giờ đầu và giờ tiếp theo nếu có
    if (room.firstHourRate && room.additionalHourRate) {
      // KHÔNG tự động chuyển sang nightly khi chọn hourly
      // Nếu user chọn hourly, luôn tính theo giờ bình thường
      
      // Bắt đầu với giá giờ đầu
      totalPrice = room.firstHourRate;
      
      // Tính số giờ tiếp theo cần tính phí
      if (durationInHours > 1) {
        let additionalHours = durationInHours - 1;
        
        // Xử lý grace period
        if (remainingMinutes > gracePeriodMinutes) {
          additionalHours += 1;
        }
        
        if (additionalHours > 0) {
          totalPrice += additionalHours * room.additionalHourRate;
        }
      } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
        totalPrice += 1 * room.additionalHourRate;
      }
      
      // Nếu số giờ vượt quá 6-8 giờ, chuyển sang tính theo ngày
      if (durationInHours > 6 && dailyRate > 0 && rateType === 'hourly') {
        totalPrice = dailyRate;
      }
    } else {
      // Sử dụng cách tính từ pricing
      if (rateType === 'daily') {
        const checkInDate = new Date(checkinTime);
        checkInDate.setHours(0, 0, 0, 0);
        const checkOutDate = new Date(checkoutTime);
        checkOutDate.setHours(0, 0, 0, 0);
        const actualDays = Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
        const durationInDays = actualDays;
        totalPrice = dailyRate * durationInDays;
        
        // Tính phụ thu check-in sớm cho daily rate (khi không có priceConfig)
        // CHỈ tính nếu check-in TRƯỚC thời gian daily (trước 12:00)
        // Nếu check-in trong thời gian daily (sau 12:00), KHÔNG tính early check-in surcharge
        const dailyStartTimeFallback = '12:00'; // Thời gian bắt đầu nhận ngày đêm
        const dailyCheckOutTimeFallback = room.priceSettings?.dailyEndTime || '12:00';
        const parseTime = (timeStr) => {
          const parts = timeStr.split(':');
          return {
            hour: parseInt(parts[0]) || 0,
            minute: parseInt(parts[1]) || 0
          };
        };
        const calculateEarlyHours = (actualTime, standardTime) => {
          const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
          const standard = parseTime(standardTime);
          const actualMinutes = actual.hour * 60 + actual.minute;
          const standardMinutes = standard.hour * 60 + standard.minute;
          if (actualMinutes < standardMinutes) {
            return Math.ceil((standardMinutes - actualMinutes) / 60);
          }
          return 0;
        };
        
        // Kiểm tra xem check-in có trong thời gian daily không (sau dailyStartTime)
        const checkInMinutesFallback = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHourFallback, startMinuteFallback] = dailyStartTimeFallback.split(':').map(Number);
        const startTimeMinutesFallback = startHourFallback * 60 + startMinuteFallback;
        const isInDailyTimeFallback = checkInMinutesFallback >= startTimeMinutesFallback;
        
        // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian daily (trước dailyStartTime)
        if (!isInDailyTimeFallback) {
          const earlyCheckinHours = calculateEarlyHours(checkinTime, dailyStartTimeFallback);
          if (earlyCheckinHours > 0) {
            const dailyEarlyCheckinSurcharge = room.priceSettings?.dailyEarlyCheckinSurcharge || 0;
            totalPrice += earlyCheckinHours * dailyEarlyCheckinSurcharge;
            console.log(`Daily early check-in (fallback): ${earlyCheckinHours} hours, surcharge: ${earlyCheckinHours * dailyEarlyCheckinSurcharge}`);
          }
        } else {
          console.log(`Daily check-in trong thời gian quy định (sau ${dailyStartTimeFallback}), không tính early check-in surcharge`);
        }
        
        // Tính phụ thu check-out trễ cho daily rate (nếu check-out sau 12:00 ngày hôm sau)
        const isNextDayForDailyFallback = checkOutDate.getTime() > checkInDate.getTime();
        const checkOutMinutesForDailyFallback = checkoutTime.getHours() * 60 + checkoutTime.getMinutes();
        const [dailyCheckOutHourFallback, dailyCheckOutMinuteFallback] = dailyCheckOutTimeFallback.split(':').map(Number);
        const dailyCheckOutMinutesFallback = dailyCheckOutHourFallback * 60 + dailyCheckOutMinuteFallback;
        
        if (isNextDayForDailyFallback && checkOutMinutesForDailyFallback > dailyCheckOutMinutesFallback) {
          // Check-out sau 12:00 ngày hôm sau
          const lateMinutes = checkOutMinutesForDailyFallback - dailyCheckOutMinutesFallback;
          const lateCheckoutHours = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const dailyLateCheckoutFee = room.priceSettings?.dailyLateCheckoutFee || 0;
          totalPrice += lateCheckoutHours * dailyLateCheckoutFee;
          console.log(`Daily late check-out (fallback): ${lateCheckoutHours} hours, fee: ${lateCheckoutHours * dailyLateCheckoutFee}`);
        } else if (!isNextDayForDailyFallback && checkOutMinutesForDailyFallback > dailyCheckOutMinutesFallback) {
          // Check-out cùng ngày nhưng sau 12:00 (trường hợp đặc biệt)
          const lateMinutes = checkOutMinutesForDailyFallback - dailyCheckOutMinutesFallback;
          const lateCheckoutHours = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const dailyLateCheckoutFee = room.priceSettings?.dailyLateCheckoutFee || 0;
          totalPrice += lateCheckoutHours * dailyLateCheckoutFee;
          console.log(`Daily late check-out (fallback, same day): ${lateCheckoutHours} hours, fee: ${lateCheckoutHours * dailyLateCheckoutFee}`);
        }
      } else if (rateType === 'nightly') {
        const nightlyCheckInDate = new Date(checkinTime);
        nightlyCheckInDate.setHours(0, 0, 0, 0);
        const nightlyCheckOutDate = new Date(checkoutTime);
        nightlyCheckOutDate.setHours(0, 0, 0, 0);
        const actualNights = Math.max(1, Math.ceil((nightlyCheckOutDate.getTime() - nightlyCheckInDate.getTime()) / (1000 * 60 * 60 * 24)));
        const durationInNights = actualNights;
        totalPrice = nightlyRate * durationInNights;
        
        // Tính phụ thu check-in sớm cho nightly rate (khi không có priceConfig)
        // CHỈ tính nếu check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
        // Nếu check-in trong thời gian nightly (sau 20:00 hoặc trước 12:00 ngày hôm sau), KHÔNG tính early check-in surcharge
        const nightlyStartTimeFallback = room.priceSettings?.nightlyStartTime || '20:00';
        const nightlyEndTimeFallback = room.priceSettings?.nightlyEndTime || '12:00';
        const parseTime = (timeStr) => {
          const parts = timeStr.split(':');
          return {
            hour: parseInt(parts[0]) || 0,
            minute: parseInt(parts[1]) || 0
          };
        };
        const calculateEarlyHours = (actualTime, standardTime) => {
          const actual = parseTime(`${actualTime.getHours()}:${actualTime.getMinutes()}`);
          const standard = parseTime(standardTime);
          const actualMinutes = actual.hour * 60 + actual.minute;
          const standardMinutes = standard.hour * 60 + standard.minute;
          if (actualMinutes < standardMinutes) {
            return Math.ceil((standardMinutes - actualMinutes) / 60);
          }
          return 0;
        };
        
        // Kiểm tra xem check-in có trong thời gian nightly không
        const checkInMinutesNightlyFallback = checkinTime.getHours() * 60 + checkinTime.getMinutes();
        const [startHourNightlyFallback, startMinuteNightlyFallback] = nightlyStartTimeFallback.split(':').map(Number);
        const startTimeMinutesNightlyFallback = startHourNightlyFallback * 60 + startMinuteNightlyFallback;
        const [endHourNightlyFallback, endMinuteNightlyFallback] = nightlyEndTimeFallback.split(':').map(Number);
        const endTimeMinutesNightlyFallback = endHourNightlyFallback * 60 + endMinuteNightlyFallback;
        
        // Thời gian nightly: từ nightlyStartTime (ví dụ 20:00) đến nightlyEndTime ngày hôm sau (ví dụ 12:00)
        const isInNightlyTimeFallback = checkInMinutesNightlyFallback >= startTimeMinutesNightlyFallback || checkInMinutesNightlyFallback <= endTimeMinutesNightlyFallback;
        
        // CHỈ tính early check-in surcharge nếu check-in TRƯỚC thời gian nightly (trước nightlyStartTime)
        if (!isInNightlyTimeFallback) {
          const earlyCheckinHoursNightly = calculateEarlyHours(checkinTime, nightlyStartTimeFallback);
          if (earlyCheckinHoursNightly > 0) {
            const nightlyEarlyCheckinSurcharge = room.priceSettings?.nightlyEarlyCheckinSurcharge || 0;
            totalPrice += earlyCheckinHoursNightly * nightlyEarlyCheckinSurcharge;
            console.log(`Nightly early check-in (fallback): ${earlyCheckinHoursNightly} hours, surcharge: ${earlyCheckinHoursNightly * nightlyEarlyCheckinSurcharge}`);
          }
        } else {
          console.log(`Nightly check-in trong thời gian quy định (${nightlyStartTimeFallback}-${nightlyEndTimeFallback}), không tính early check-in surcharge`);
        }
        
        // Tính phụ thu check-out trễ cho nightly rate (nếu check-out sau 12:00 ngày hôm sau)
        // Sử dụng nightlyEndTimeFallback đã khai báo ở trên (dòng 2628)
        const isNextDayForNightlyFallback = nightlyCheckOutDate.getTime() > nightlyCheckInDate.getTime();
        const checkOutMinutesForNightlyFallback = checkoutTime.getHours() * 60 + checkoutTime.getMinutes();
        // Sử dụng lại nightlyEndTimeFallback đã khai báo ở trên, parse lại để tính checkout
        const [nightlyEndHourForCheckout, nightlyEndMinuteForCheckout] = nightlyEndTimeFallback.split(':').map(Number);
        const nightlyEndMinutesFallback = nightlyEndHourForCheckout * 60 + nightlyEndMinuteForCheckout;
        
        if (isNextDayForNightlyFallback && checkOutMinutesForNightlyFallback > nightlyEndMinutesFallback) {
          // Check-out sau 12:00 ngày hôm sau
          const lateMinutes = checkOutMinutesForNightlyFallback - nightlyEndMinutesFallback;
          const lateCheckoutHoursNightly = Math.ceil(lateMinutes / 60); // Làm tròn lên
          const nightlyLateCheckoutSurcharge = room.priceSettings?.nightlyLateCheckoutSurcharge || 0;
          totalPrice += lateCheckoutHoursNightly * nightlyLateCheckoutSurcharge;
          console.log(`Nightly late check-out (fallback): ${lateCheckoutHoursNightly} hours, surcharge: ${lateCheckoutHoursNightly * nightlyLateCheckoutSurcharge}`);
        }
      } else {
        // hourly
        totalPrice = hourlyRate;
        if (durationInHours >= 1) {
          let additionalRate = hourlyRate * 0.8;
          let billableHours = durationInHours - 1;
          
          if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
            billableHours += 1;
          } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
            billableHours = 1;
          }
          
          if (billableHours > 0) {
            totalPrice += billableHours * additionalRate;
          }
        }
      }
    }
  }
  
  return Math.max(0, Math.round(totalPrice));
}

// Lấy phòng khả dụng
async function getAvailableRooms(req, res) {
  try {
    const { hotelId, checkInDate, checkOutDate, floor } = req.query;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    // Staff chỉ được xem phòng của hotel mà họ trực thuộc
    let finalHotelId = hotelId;
    if (userRole === 'staff') {
      if (userHotelId) {
        finalHotelId = userHotelId.toString();
      } else {
        return res.status(403).json({ error: 'Bạn không có quyền xem phòng của khách sạn này' });
      }
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem phòng của hotel mình
      finalHotelId = userHotelId.toString();
    }
    
    if (!finalHotelId) {
      return res.status(400).json({ error: 'Vui lòng cung cấp ID khách sạn' });
    }
    
    // Tạo query dựa trên params
    const query = {
      hotelId: finalHotelId,
      status: 'vacant'
    };
    
    if (floor) query.floor = parseInt(floor);
    
    // Lấy tất cả phòng của khách sạn
    const rooms = await Room.find(query);
    
    if (checkInDate && checkOutDate) {
      // Lọc các phòng đã đặt trong khoảng thời gian này
      const startDate = new Date(checkInDate);
      const endDate = new Date(checkOutDate);
      
      // Tìm các booking trong khoảng thời gian này
      const bookings = await Booking.find({
        hotelId: finalHotelId,
        $or: [
          {
            // Kiểm tra các booking có thời gian check-in nằm trong khoảng thời gian cần kiểm tra
            checkInDate: { $gte: startDate, $lt: endDate }
          },
          {
            // Kiểm tra các booking có thời gian check-out nằm trong khoảng thời gian cần kiểm tra
            checkOutDate: { $gt: startDate, $lte: endDate }
          },
          {
            // Kiểm tra các booking bao trùm khoảng thời gian cần kiểm tra
            checkInDate: { $lte: startDate },
            checkOutDate: { $gte: endDate }
          }
        ],
        status: { $in: ['pending', 'confirmed', 'checked_in'] }
      });
      
      // Lấy danh sách ID phòng đã đặt
      const bookedRoomIds = bookings.map(booking => booking.roomId.toString());
      
      // Lọc ra các phòng chưa đặt
      const availableRooms = rooms.filter(room => !bookedRoomIds.includes(room._id.toString()));
      
      return res.status(200).json(availableRooms);
    }
    
    res.status(200).json(rooms);
  } catch (error) {
    console.error('Error fetching available rooms:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách phòng khả dụng' });
  }
}

// Lấy phòng theo tầng
async function getRoomsByFloor(req, res) {
  try {
    const { hotelId, floor } = req.params;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    // Staff chỉ được xem phòng của hotel mà họ trực thuộc
    let finalHotelId = hotelId;
    if (userRole === 'staff') {
      if (userHotelId && userHotelId.toString() !== hotelId) {
        return res.status(403).json({ error: 'Bạn không có quyền xem phòng của khách sạn này' });
      }
      if (userHotelId) {
        finalHotelId = userHotelId.toString();
      } else {
        return res.status(403).json({ error: 'Bạn không có quyền xem phòng' });
      }
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem phòng của hotel mình
      if (userHotelId.toString() !== hotelId) {
        return res.status(403).json({ error: 'Bạn không có quyền xem phòng của khách sạn này' });
      }
      finalHotelId = userHotelId.toString();
    }
    
    const rooms = await Room.find({
      hotelId: finalHotelId,
      floor: parseInt(floor)
    });
    
    res.status(200).json(rooms);
  } catch (error) {
    console.error('Error fetching rooms by floor:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách phòng theo tầng' });
  }
}

// Lấy danh sách các tầng của khách sạn
async function getHotelFloors(req, res) {
  try {
    const { hotelId } = req.params;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    // Staff chỉ được xem tầng của hotel mà họ trực thuộc
    let finalHotelId = hotelId;
    if (userRole === 'staff') {
      if (userHotelId && userHotelId.toString() !== hotelId) {
        return res.status(403).json({ error: 'Bạn không có quyền xem tầng của khách sạn này' });
      }
      if (userHotelId) {
        finalHotelId = userHotelId.toString();
      } else {
        return res.status(403).json({ error: 'Bạn không có quyền xem tầng' });
      }
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem tầng của hotel mình
      if (userHotelId.toString() !== hotelId) {
        return res.status(403).json({ error: 'Bạn không có quyền xem tầng của khách sạn này' });
      }
      finalHotelId = userHotelId.toString();
    }
    
    // Kiểm tra kết nối database
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database connection is not available. Please try again later.' 
      });
    }
    
    // Lấy danh sách tầng duy nhất với timeout
    const floors = await Room.distinct('floor', { hotelId: finalHotelId })
      .maxTimeMS(10000) // 10 seconds timeout
      .lean();
    
    // Lọc bỏ các giá trị null/undefined và sắp xếp
    const validFloors = floors.filter(floor => floor !== null && floor !== undefined);
    validFloors.sort((a, b) => {
      // Xử lý cả số và chuỗi
      const aNum = typeof a === 'number' ? a : parseFloat(a);
      const bNum = typeof b === 'number' ? b : parseFloat(b);
      return aNum - bNum;
    });
    
    res.status(200).json({ floors: validFloors });
  } catch (error) {
    console.error('Error fetching hotel floors:', error);
    
    // Xử lý các loại lỗi khác nhau
    if (error.name === 'MongoServerSelectionError' || error.name === 'MongooseError') {
      res.status(503).json({ 
        error: 'Không thể kết nối đến database. Vui lòng kiểm tra kết nối mạng hoặc cấu hình database.' 
      });
    } else if (error.name === 'MongoTimeoutError') {
      res.status(504).json({ 
        error: 'Query timeout. Vui lòng thử lại sau.' 
      });
    } else {
      res.status(500).json({ error: 'Lỗi khi lấy danh sách tầng của khách sạn' });
    }
  }
}

// Lấy lịch sử phòng
const getRoomHistory = async (req, res) => {
  try {
    // Parse và validate page và limit
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    const { hotelId, roomId, filterType = 'all' } = req.query;
    
    // Đảm bảo page và limit là số hợp lệ
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    
    // Giới hạn limit tối đa để tránh load quá nhiều dữ liệu
    const MAX_LIMIT = 1000;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    
    const skip = (page - 1) * limit;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    const query = {};
    
    // Staff chỉ được xem lịch sử phòng của hotel mà họ trực thuộc
    if (userRole === 'staff') {
      if (userHotelId) {
        query.hotelId = userHotelId;
      } else {
        return res.status(200).json({ data: [], total: 0, totalPayment: 0 });
      }
    } else if (hotelId) {
      query.hotelId = hotelId;
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem lịch sử phòng của hotel mình
      query.hotelId = userHotelId;
    } else if (userRole === 'business' && req.user?.businessId) {
      // Business chỉ xem lịch sử phòng của hotels thuộc business
      const { Hotel } = require('../models/hotel');
      const hotels = await Hotel.find({ businessId: req.user.businessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      query.hotelId = { $in: hotelIds };
    }
    
    if (roomId) {
      query._id = roomId;
    }
    
    // Lấy danh sách phòng phù hợp với điều kiện
    const rooms = await Room.find(query);
    
    // Tập hợp tất cả bookingHistory từ các phòng
    let allHistory = [];
    let totalPayment = 0;
    
    // Lấy tất cả invoiceIds từ bookingHistory để populate invoice
    const allInvoiceIds = [];
    rooms.forEach(room => {
      if (room.bookingHistory && room.bookingHistory.length > 0) {
        room.bookingHistory.forEach(history => {
          if (history.invoiceId) {
            allInvoiceIds.push(history.invoiceId);
          }
        });
      }
    });

    // Populate invoices để lấy paymentStatus mới nhất
    const { Invoice } = require('../models/invoice');
    const invoicesMap = new Map();
    if (allInvoiceIds.length > 0) {
      const invoices = await Invoice.find({ _id: { $in: allInvoiceIds } });
      invoices.forEach(inv => {
        invoicesMap.set(inv._id.toString(), inv);
      });
    }

    rooms.forEach(room => {
      if (room.bookingHistory && room.bookingHistory.length > 0) {
        // Thêm thông tin phòng vào mỗi lịch sử booking
        const roomHistoryWithDetails = room.bookingHistory.map(history => {
          // Tính tổng doanh thu
          if (history.totalAmount) {
            totalPayment += history.totalAmount;
          }
          
          // Lấy guestSource từ nhiều nguồn
          let guestSource = 'walkin';
          if (history.guestSource) {
            guestSource = history.guestSource;
          } else if (history.guestInfo?.guestSource) {
            guestSource = history.guestInfo.guestSource;
          } else if (history.event?.guestInfo?.guestSource) {
            guestSource = history.event.guestInfo.guestSource;
          }
          
          // Lấy invoice mới nhất để cập nhật paymentStatus
          let updatedHistory = {
            ...history.toObject(),
            roomNumber: room.roomNumber,
            roomId: room._id,
            bookingId: history._id,
            guestSource: guestSource // Đảm bảo guestSource được thêm vào
          };

          // Cập nhật paymentStatus và paymentMethod từ invoice mới nhất
          if (history.invoiceId) {
            const invoice = invoicesMap.get(history.invoiceId.toString());
            if (invoice) {
              updatedHistory.paymentStatus = invoice.paymentStatus || updatedHistory.paymentStatus || 'pending';
              if (invoice.paymentMethod) {
                updatedHistory.paymentMethod = invoice.paymentMethod;
              }
              if (invoice.status) {
                updatedHistory.status = invoice.status;
              }
              if ((!updatedHistory.notes || updatedHistory.notes.trim().length === 0) && invoice.notes) {
                updatedHistory.notes = invoice.notes;
              }
              updatedHistory.invoice = {
                _id: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                paymentStatus: invoice.paymentStatus,
                paymentMethod: invoice.paymentMethod,
                status: invoice.status,
                totalAmount: invoice.totalAmount,
                paidDate: invoice.paidDate
              };
            }
          }

          // Đảm bảo có advancePaymentMethod cho history (ưu tiên từ history, sau đó từ paymentMethod)
          if (!updatedHistory.advancePaymentMethod) {
            if (updatedHistory.paymentMethod) {
              updatedHistory.advancePaymentMethod = updatedHistory.paymentMethod;
            }
          }
          
          return updatedHistory;
        });
        
        allHistory = [...allHistory, ...roomHistoryWithDetails];
      }
    });
    
    // Loại trừ các booking (đặt trước) khỏi lịch sử thanh toán
    allHistory = allHistory.filter(history => {
      const eventType = (history.event || '').toLowerCase();
      // Loại trừ booking và cancel_booking
      if (eventType === 'booking' || eventType === 'cancel_booking' || eventType === 'checked_in') {
        return false;
      }
      return true;
    });
    
    // Lọc dữ liệu theo filterType
    if (filterType === 'checkout' || filterType === 'check-out') {
      allHistory = allHistory.filter(history => 
        history.event === 'check-out' || 
        (history.checkOutTime && history.checkInTime)
      );
    } else if (filterType === 'checkin' || filterType === 'check-in') {
      allHistory = allHistory.filter(history => 
        history.event === 'check-in' || 
        (history.checkInTime && !history.checkOutTime)
      );
    } else if (filterType === 'maintenance') {
      allHistory = allHistory.filter(history => 
        history.event === 'maintenance'
      );
    }
    
    // Sắp xếp theo thời gian gần nhất
    allHistory.sort((a, b) => {
      // Ưu tiên sắp xếp theo thời gian checkout nếu có
      const timeA = a.checkOutTime || a.date || a.checkInTime;
      const timeB = b.checkOutTime || b.date || b.checkInTime;
      return new Date(timeB) - new Date(timeA);
    });
    
    // Phân trang
    const totalItems = allHistory.length;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;
    
    // Đảm bảo skip không vượt quá totalItems
    const validSkip = Math.min(skip, totalItems);
    const validLimit = Math.min(limit, totalItems - validSkip);
    const paginatedHistory = allHistory.slice(validSkip, validSkip + validLimit);
    
    // Đảm bảo currentPage hợp lệ
    const currentPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    
    res.status(200).json({
      history: paginatedHistory,
      totalPages: totalPages,
      currentPage: currentPage,
      totalPayment: totalPayment,
      totalItems: totalItems,
      pageSize: limit
    });
  } catch (error) {
    console.error('Error in getRoomHistory:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy lịch sử phòng', error: error.message });
  }
};

// Lấy chi tiết hóa đơn
const getInvoiceDetails = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    // Tìm phòng có bookingHistory chứa invoiceId
    const room = await Room.findOne({
      'bookingHistory._id': invoiceId
    }).populate('hotelId');
    
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }
    
    // Staff chỉ được xem hóa đơn của hotel mà họ trực thuộc
    if (userRole === 'staff') {
      if (!userHotelId || room.hotelId._id.toString() !== userHotelId.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem hóa đơn này' });
      }
    } else if (userRole === 'hotel' && userHotelId) {
      // Hotel manager chỉ xem hóa đơn của hotel mình
      if (room.hotelId._id.toString() !== userHotelId.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem hóa đơn này' });
      }
    } else if (userRole === 'business' && req.user?.businessId) {
      // Business chỉ xem hóa đơn của hotels thuộc business
      if (room.hotelId.businessId.toString() !== req.user.businessId.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem hóa đơn này' });
      }
    }
    
    // Tìm booking history với ID tương ứng
    const history = room.bookingHistory.find(history => 
      history._id.toString() === invoiceId
    );
    
    if (!history) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }
    
    // Lấy thông tin khách sạn
    const hotel = room.hotelId;
    
    // Lấy thông tin checkout event (event cuối cùng)
    const latestEvents = room.events
      .filter(e => e.type === 'checkout')
      .sort((a, b) => new Date(b.checkoutTime) - new Date(a.checkoutTime));
    
    const checkoutEvent = latestEvents.length > 0 ? latestEvents[0] : null;
    const checkinEvent = checkoutEvent && checkoutEvent.checkinTime ? 
      { checkinTime: checkoutEvent.checkinTime } : 
      { checkinTime: history.date ? new Date(history.date.getTime() - 3600000) : new Date() }; // Giả định nhận phòng 1 giờ trước nếu không có dữ liệu
    
    // Tìm booking nếu có
    let booking = null;
    if (history.bookingId) {
      const Booking = mongoose.model('Booking');
      booking = await Booking.findById(history.bookingId);
    }
    
    // Tạo dữ liệu hóa đơn
    const invoiceData = {
      invoiceNumber: history._id,
      date: history.date || new Date(),
      customerName: booking ? booking.guestDetails?.name : "Khách lẻ",
      staffName: booking ? booking.staffName : "Nhân viên",
      roomNumber: room.roomNumber,
      checkInTime: checkinEvent.checkinTime || new Date(new Date(history.date).getTime() - 3600000),
      checkOutTime: checkoutEvent ? checkoutEvent.checkoutTime : history.date,
      products: [
        { name: `Tiền phòng ${room.roomNumber}`, price: history.amount || 0 }
      ],
      totalAmount: history.amount || 0,
      paymentMethod: booking && booking.paymentDetails ? booking.paymentDetails.paymentMethod : 'cash',
      
      // Thông tin khách sạn
      hotelId: hotel ? hotel._id : null,
      businessName: hotel ? hotel.name : "Khách sạn",
      business_address: hotel ? hotel.address : "",
      phoneNumber: hotel ? hotel.phoneNumber : ""
    };
    
    res.status(200).json(invoiceData);
  } catch (error) {
    console.error('Error in getInvoiceDetails:', error);
    res.status(500).json({ message: 'Lỗi server khi lấy chi tiết hóa đơn', error: error.message });
  }
};

// Cập nhật trạng thái phòng
async function updateRoomStatus(req, res) {
  try {
    const { id: roomId } = req.params;
    const { status: newStatus, staffId, note: notes } = req.body; // Lấy từ status và note (theo frontend)
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra có thể thay đổi trạng thái không
    if (room.status === 'occupied' && newStatus !== 'occupied') {
      return res.status(400).json({ 
        error: 'Không thể thay đổi trạng thái của phòng đang có khách' 
      });
    }
    
    // Lưu trạng thái cũ trước khi cập nhật
    const oldStatus = room.status;
    
    // Cập nhật trạng thái phòng
    room.status = newStatus;
    
    // Reset guestStatus khi phòng không còn occupied
    if (newStatus !== 'occupied') {
      room.guestStatus = null;
    }
    
    // Tạo event khi báo bẩn hoặc sửa phòng
    if (newStatus === 'dirty' || newStatus === 'maintenance') {
      const eventData = {
        type: 'maintenance',
        notes: notes || (newStatus === 'dirty' ? 'Báo bẩn phòng' : 'Báo sửa phòng'),
        createdAt: new Date()
      };
      
      if (staffId) {
        eventData.staffId = staffId;
      }
      
      // Lưu event vào RoomEvent collection và room document
      await saveEventToBoth(room, eventData);
      
      // Tạo thông báo tự động khi báo bẩn hoặc bảo trì
      createAutoAnnouncement('maintenance', room.hotelId, room._id, room.roomNumber, '', {
        isCompleted: false,
        notes: notes || (newStatus === 'dirty' ? 'Báo bẩn phòng' : 'Báo sửa phòng')
      }).catch(err => console.error('Error creating maintenance announcement:', err));
    }
    
    // Nếu là trạng thái phòng trống từ bảo trì, thêm vào lịch sử
    if (oldStatus === 'maintenance' && newStatus === 'vacant') {
      if (!room.bookingHistory) {
        room.bookingHistory = [];
      }
      
      room.bookingHistory.push({
        event: 'maintenance',
        date: new Date(),
        staffId: staffId,
        notes: notes || 'Đã hoàn thành bảo trì'
      });
    }
    
    await room.save();
    
    res.status(200).json({
      message: 'Cập nhật trạng thái phòng thành công',
      room
    });
  } catch (error) {
    console.error('Error updating room status:', error);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái phòng', details: error.message });
  }
}

// Chuyển phòng
async function transferRoom(req, res) {
  try {
    const { staffId, notes } = req.body;
    const sourceRoomId = req.body.sourceRoomId || req.body.fromRoomId;
    const targetRoomId = req.body.targetRoomId || req.body.toRoomId;
    if (!sourceRoomId || !targetRoomId) {
      return res.status(400).json({ error: 'Thiếu phòng nguồn hoặc phòng đích' });
    }
    
    // Validate và chuyển đổi staffId thành ObjectId hợp lệ hoặc null
    // Nếu staffId là "unknown" hoặc không hợp lệ, set thành null
    let staffIdObjectId = null;
    if (staffId && staffId !== 'unknown' && mongoose.Types.ObjectId.isValid(staffId)) {
      try {
        staffIdObjectId = new mongoose.Types.ObjectId(staffId);
      } catch (e) {
        console.warn('Invalid staffId for transfer:', staffId);
        staffIdObjectId = null;
      }
    }
    
    // Kiểm tra phòng nguồn
    const sourceRoom = await Room.findById(sourceRoomId);
    if (!sourceRoom) {
      return res.status(404).json({ error: 'Không tìm thấy phòng nguồn' });
    }
    
    // Kiểm tra phòng đích
    const targetRoom = await Room.findById(targetRoomId);
    if (!targetRoom) {
      return res.status(404).json({ error: 'Không tìm thấy phòng đích' });
    }
    
    // Kiểm tra trạng thái phòng nguồn (phải đang có khách)
    if (sourceRoom.status !== 'occupied') {
      return res.status(400).json({ 
        error: 'Phòng nguồn phải đang có khách để chuyển phòng' 
      });
    }
    
    // Kiểm tra trạng thái phòng đích (phải trống)
    if (targetRoom.status !== 'vacant') {
      return res.status(400).json({ 
        error: 'Phòng đích phải đang trống để nhận khách' 
      });
    }
    
    // Tìm event check-in cuối cùng của phòng nguồn từ RoomEvent collection (chưa checkout)
    // CHỈ SỬ DỤNG RoomEvent collection, không sử dụng room.events nữa
    let lastCheckinEvent = await getLastUncheckedOutCheckinEvent(sourceRoomId);
    
    // Kiểm tra xem có event checkin không
    if (!lastCheckinEvent) {
      return res.status(400).json({ 
        error: 'Không tìm thấy thông tin check-in từ RoomEvent collection. Phòng nguồn phải đang có khách để chuyển phòng.' 
      });
    }
    
    console.log('Found lastCheckinEvent for transfer:', {
      sourceRoom: sourceRoom.roomNumber,
      eventId: lastCheckinEvent._id,
      checkinTime: lastCheckinEvent.checkinTime,
      guestInfo: lastCheckinEvent.guestInfo?.name || 'N/A'
    });
    
    // Chuyển đổi lastCheckinEvent thành plain object nếu là Mongoose document
    if (lastCheckinEvent && lastCheckinEvent.toObject) {
      lastCheckinEvent = lastCheckinEvent.toObject();
    }
    
    // Đảm bảo guestInfo là object hợp lệ
    if (lastCheckinEvent && lastCheckinEvent.guestInfo) {
      if (typeof lastCheckinEvent.guestInfo === 'object' && !Array.isArray(lastCheckinEvent.guestInfo)) {
        lastCheckinEvent.guestInfo = {
          name: lastCheckinEvent.guestInfo.name || '',
          idNumber: lastCheckinEvent.guestInfo.idNumber || '',
          phone: lastCheckinEvent.guestInfo.phone || '',
          email: lastCheckinEvent.guestInfo.email || '',
          address: lastCheckinEvent.guestInfo.address || '',
          guestSource: lastCheckinEvent.guestInfo.guestSource || 'walkin'
        };
      }
    }
    
    // Tìm booking đang active của phòng nguồn
    const booking = await Booking.findOne({
      roomId: sourceRoomId,
      status: 'checked_in'
    });
    
    // Nếu có booking, cập nhật booking với giá mới theo phòng đích
    if (booking) {
      // Lấy rateType từ booking cũ hoặc từ event checkin
      const rateType = booking.bookingType || (lastCheckinEvent?.rateType || 'hourly');
      
      // Tính basePrice mới theo phòng đích
      let newBasePrice = 0;
      if (rateType === 'hourly') {
        newBasePrice = targetRoom.pricing?.hourly || targetRoom.firstHourRate || 0;
      } else if (rateType === 'daily') {
        newBasePrice = targetRoom.pricing?.daily || 0;
      } else if (rateType === 'nightly') {
        newBasePrice = targetRoom.pricing?.nightly || 0;
      }
      
      // Đảm bảo basePrice có giá trị
      if (!newBasePrice || newBasePrice === 0) {
        newBasePrice = booking.basePrice || 0; // Giữ nguyên giá cũ nếu không có giá mới
      }
      
      // Lấy giá trị basePrice cũ trước khi cập nhật (để log)
      const oldBasePrice = booking.basePrice || 0;
      
      // Chuyển đổi additionalCharges, discounts, services thành array TRƯỚC KHI tính toán
      // Đảm bảo additionalCharges là array (luôn chuyển thành array, kể cả khi là 0)
      let additionalChargesArray = [];
      const bookingAdditionalCharges = booking.additionalCharges;
      if (Array.isArray(bookingAdditionalCharges)) {
        // Clone array để tránh reference issues
        additionalChargesArray = JSON.parse(JSON.stringify(bookingAdditionalCharges));
      } else if (typeof bookingAdditionalCharges === 'number' && bookingAdditionalCharges > 0) {
        additionalChargesArray = [{
          description: 'Phụ thu',
          amount: bookingAdditionalCharges,
          date: new Date()
        }];
      } else {
        // Nếu là 0, null, undefined hoặc không phải array, set thành array rỗng
        additionalChargesArray = [];
      }
      
      // Đảm bảo discounts là array (luôn chuyển thành array, kể cả khi là 0)
      let discountsArray = [];
      const bookingDiscounts = booking.discounts;
      if (Array.isArray(bookingDiscounts)) {
        // Clone array để tránh reference issues
        discountsArray = JSON.parse(JSON.stringify(bookingDiscounts));
      } else if (typeof bookingDiscounts === 'number' && bookingDiscounts > 0) {
        discountsArray = [{
          description: 'Khuyến mãi',
          amount: bookingDiscounts,
          date: new Date()
        }];
      } else {
        // Nếu là 0, null, undefined hoặc không phải array, set thành array rỗng
        discountsArray = [];
      }
      
      // Đảm bảo services là array
      const servicesArray = Array.isArray(booking.services) 
        ? JSON.parse(JSON.stringify(booking.services)) 
        : [];
      
      // Tính lại totalAmount dựa trên basePrice mới và các khoản khác (sử dụng array đã chuyển đổi)
      const additionalChargesTotal = additionalChargesArray.reduce((sum, charge) => sum + (charge.amount || 0), 0);
      const discountsTotal = discountsArray.reduce((sum, discount) => sum + (discount.amount || 0), 0);
      const servicesTotal = servicesArray.reduce((sum, service) => sum + (service.totalPrice || 0), 0);
      
      const newTotalAmount = newBasePrice + additionalChargesTotal + servicesTotal - discountsTotal;
      
      // Cập nhật notes
      const updatedNotes = (booking.notes || '') + `\nChuyển từ phòng ${sourceRoom.roomNumber} sang phòng ${targetRoom.roomNumber} - ${notes || 'Không có ghi chú'}`;
      
      // Sử dụng staffIdObjectId đã được khai báo và validate ở đầu hàm
      // Không cần khai báo lại ở đây
      
      // Chuẩn bị thông tin chuyển phòng
      // Lấy số phòng từ sourceRoom và targetRoom
      const sourceRoomNumber = sourceRoom.roomNumber || 'N/A';
      const targetRoomNumber = targetRoom.roomNumber || 'N/A';
      
      const transferInfo = {
        fromRoomId: sourceRoomId,
        toRoomId: targetRoomId,
        fromRoomNumber: sourceRoomNumber,
        toRoomNumber: targetRoomNumber,
        transferredAt: new Date(),
        transferredBy: staffIdObjectId || null,
        notes: notes || 'Chuyển phòng',
        oldBasePrice: oldBasePrice,
        newBasePrice: newBasePrice
      };
      
      // Lấy thông tin chuyển phòng cũ (nếu có) để thêm vào history
      const existingTransferHistory = Array.isArray(booking.transferHistory) ? [...booking.transferHistory] : [];
      
      // Nếu đã có transferredFrom (đã chuyển phòng trước đó), thêm lần chuyển trước vào history
      if (booking.transferredFrom && booking.transferredFrom.toString() !== sourceRoomId.toString()) {
        // Đã chuyển phòng trước đó, thêm vào history
        const previousFromRoom = await Room.findById(booking.transferredFrom).lean();
        const previousToRoom = await Room.findById(booking.roomId).lean();
        existingTransferHistory.push({
          fromRoomId: booking.transferredFrom,
          toRoomId: booking.roomId,
          fromRoomNumber: previousFromRoom?.roomNumber || 'N/A',
          toRoomNumber: previousToRoom?.roomNumber || 'N/A',
          transferredAt: booking.transferredAt || booking.updatedAt,
          transferredBy: booking.transferredBy || null,
          notes: 'Chuyển phòng trước đó',
          oldBasePrice: booking.basePrice || 0,
          newBasePrice: booking.basePrice || 0
        });
      }
      
      // Xác định phòng ban đầu (transferredFrom)
      // Nếu chưa có transferredFrom, đây là lần chuyển đầu tiên → phòng ban đầu là roomId hiện tại của booking (sourceRoomId)
      // Nếu đã có transferredFrom, giữ nguyên phòng ban đầu
      const originalRoomId = booking.transferredFrom || booking.roomId || sourceRoomId;
      
      // Chuẩn bị update object
      const updateData = {
        $set: {
          roomId: targetRoomId,
          basePrice: newBasePrice,
          totalAmount: Math.max(0, newTotalAmount),
          additionalCharges: additionalChargesArray,
          discounts: discountsArray,
          services: servicesArray,
          notes: updatedNotes,
          // Cập nhật thông tin chuyển phòng
          transferredFrom: originalRoomId, // Phòng ban đầu (giữ nguyên nếu đã có)
          transferredTo: targetRoomId, // Phòng đích hiện tại
          transferredAt: new Date(),
          transferredBy: staffIdObjectId || null,
          transferHistory: [...existingTransferHistory, transferInfo] // Thêm lần chuyển hiện tại vào history
        }
      };
      
      // Tạo transferLog với staffId là ObjectId hoặc undefined (không truyền nếu không hợp lệ)
      // staffIdObjectId đã được khởi tạo ở trên
      const transferLog = {
        action: 'room_transfer',
        timestamp: new Date(),
        details: `Chuyển từ phòng ${sourceRoom.roomNumber} sang phòng ${targetRoom.roomNumber}. BasePrice cũ: ${oldBasePrice}, BasePrice mới: ${newBasePrice}. ${notes || 'Không có ghi chú'}`
      };
      
      // Chỉ thêm staffId nếu hợp lệ
      if (staffIdObjectId) {
        transferLog.staffId = staffIdObjectId;
      }
      
      // Thêm logs nếu chưa có hoặc push vào nếu đã có
      if (!booking.logs || !Array.isArray(booking.logs) || booking.logs.length === 0) {
        updateData.$set.logs = [transferLog];
      } else {
        updateData.$push = { logs: transferLog };
      }
      
      // Cập nhật booking bằng findByIdAndUpdate để tránh lỗi Mongoose document
      await Booking.findByIdAndUpdate(
        booking._id,
        updateData,
        { 
          new: true,
          runValidators: false // Tắt validation để tránh lỗi
        }
      );
    }
    
    // Lưu event chuyển phòng vào RoomEvent collection cho phòng nguồn
    // QUAN TRỌNG: Chỉ thêm staffId và transferredBy nếu staffIdObjectId hợp lệ (không phải null)
    try {
      const transferEventData = {
        type: 'transfer',
        transferredFrom: sourceRoom._id,
        transferredTo: targetRoom._id,
        transferredAt: new Date(),
        notes: `Chuyển từ phòng ${sourceRoom.roomNumber} sang phòng ${targetRoom.roomNumber}. ${notes || 'Không có ghi chú'}`
      };
      
      // Chỉ thêm staffId và transferredBy nếu hợp lệ
      if (staffIdObjectId) {
        transferEventData.staffId = staffIdObjectId;
        transferEventData.transferredBy = staffIdObjectId;
      }
      
      await saveRoomEvent(sourceRoom._id, sourceRoom.hotelId, transferEventData);
    } catch (error) {
      console.error('Error saving transfer event:', error);
      // Không throw error ở đây vì event checkin đã được tạo cho phòng đích
      // Chỉ log để debug
    }
    
    // Chuyển event check-in sang phòng đích nếu có
    if (lastCheckinEvent) {
      console.log('Transferring checkin event:', {
        sourceRoom: sourceRoom.roomNumber,
        targetRoom: targetRoom.roomNumber,
        lastCheckinEvent: {
          checkinTime: lastCheckinEvent.checkinTime,
          guestInfo: lastCheckinEvent.guestInfo,
          rateType: lastCheckinEvent.rateType,
          advancePayment: lastCheckinEvent.advancePayment,
          selectedServices: lastCheckinEvent.selectedServices
        }
      });
      
      // Chuyển dữ liệu event từ phòng nguồn sang phòng đích
      // Đảm bảo type luôn có (required field) và tất cả thông tin được giữ nguyên
      // Sử dụng nullish coalescing (??) thay vì || để tránh mất giá trị 0 hoặc false
      // QUAN TRỌNG: Giữ nguyên checkinTime chính xác từ event cũ để đảm bảo có thể query được
      let checkinTimeForNewEvent = lastCheckinEvent.checkinTime;
      if (!(checkinTimeForNewEvent instanceof Date)) {
        checkinTimeForNewEvent = new Date(checkinTimeForNewEvent);
      }
      
      // Chỉ lưu thông tin cần thiết: khách, dịch vụ, đặt trước, khuyến mãi, phụ thu, ghi chú
      // QUAN TRỌNG: Chỉ thêm staffId và transferredBy nếu staffIdObjectId hợp lệ (không phải null)
      const newEvent = {
        type: 'checkin', // Luôn là checkin cho phòng mới
        checkinTime: checkinTimeForNewEvent, // Giữ nguyên checkinTime chính xác từ phòng cũ
        checkoutTime: null, // Reset checkoutTime
        expectedCheckoutTime: lastCheckinEvent.expectedCheckoutTime ? new Date(lastCheckinEvent.expectedCheckoutTime) : null,
        payment: 0, // Reset payment
        userId: lastCheckinEvent.userId ?? null,
        // Chỉ thêm staffId nếu staffIdObjectId hợp lệ (không phải null)
        ...(staffIdObjectId ? { staffId: staffIdObjectId } : {}),
        guestInfo: lastCheckinEvent.guestInfo ?? null, // Thông tin khách từ phòng cũ
        paymentMethod: 'cash', // Reset paymentMethod
        rateType: lastCheckinEvent.rateType ?? 'hourly', // Giữ nguyên rateType
        advancePayment: lastCheckinEvent.advancePayment ?? 0, // Đặt trước từ phòng cũ
        additionalCharges: lastCheckinEvent.additionalCharges ?? 0, // Phụ thu từ phòng cũ
        discount: lastCheckinEvent.discount ?? 0, // Khuyến mãi từ phòng cũ
        selectedServices: lastCheckinEvent.selectedServices ?? [], // Dịch vụ từ phòng cũ
        transferredFrom: sourceRoom._id,
        transferredAt: new Date(),
        // Chỉ thêm transferredBy nếu staffIdObjectId hợp lệ (không phải null)
        ...(staffIdObjectId ? { transferredBy: staffIdObjectId } : {}),
        notes: (notes ? notes + '. ' : '') + (lastCheckinEvent.notes ?? '') // Ghi chú từ phòng cũ + ghi chú mới
      };
      
      // Đảm bảo guestInfo là object hợp lệ với đầy đủ thông tin
      // Nếu guestInfo tồn tại (không null/undefined), đảm bảo nó có đầy đủ các trường
      if (newEvent.guestInfo && typeof newEvent.guestInfo === 'object' && !Array.isArray(newEvent.guestInfo)) {
        newEvent.guestInfo = {
          name: newEvent.guestInfo.name ?? '',
          idNumber: newEvent.guestInfo.idNumber ?? '',
          phone: newEvent.guestInfo.phone ?? '',
          email: newEvent.guestInfo.email ?? '',
          address: newEvent.guestInfo.address ?? '',
          guestSource: newEvent.guestInfo.guestSource ?? 'walkin'
        };
      } else if (!newEvent.guestInfo) {
        // Nếu không có guestInfo, tạo object rỗng với giá trị mặc định
        console.warn('No guestInfo found in lastCheckinEvent, creating default guestInfo');
        newEvent.guestInfo = {
          name: '',
          idNumber: '',
          phone: '',
          email: '',
          address: '',
          guestSource: 'walkin'
        };
      }
      
      // Đảm bảo selectedServices là array hợp lệ với đầy đủ thông tin
      if (!Array.isArray(newEvent.selectedServices)) {
        newEvent.selectedServices = [];
      } else {
        // Đảm bảo mỗi service có đầy đủ thông tin
        newEvent.selectedServices = newEvent.selectedServices.map(service => ({
          serviceId: service.serviceId || null,
          serviceName: service.serviceName || service.name || 'Dịch vụ',
          price: service.price || 0,
          quantity: service.quantity || 1,
          totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1),
          orderTime: service.orderTime || new Date()
        }));
      }
      
      // Log thông tin trước khi lưu
      console.log('Saving new checkin event to target room:', {
        targetRoom: targetRoom.roomNumber,
        guestInfo: newEvent.guestInfo,
        rateType: newEvent.rateType,
        advancePayment: newEvent.advancePayment,
        selectedServices: newEvent.selectedServices?.length || 0
      });
      
      // Lưu event checkin mới vào RoomEvent collection cho phòng đích
      // QUAN TRỌNG: Chỉ thêm staffId và transferredBy nếu có trong newEvent (đã được validate)
      const checkinEventData = {
        type: 'checkin',
        checkinTime: newEvent.checkinTime,
        checkoutTime: newEvent.checkoutTime,
        expectedCheckoutTime: newEvent.expectedCheckoutTime,
        payment: newEvent.payment,
        userId: newEvent.userId,
        guestInfo: newEvent.guestInfo, // Đảm bảo guestInfo đầy đủ
        paymentMethod: newEvent.paymentMethod,
        rateType: newEvent.rateType,
        advancePayment: newEvent.advancePayment,
        additionalCharges: newEvent.additionalCharges,
        discount: newEvent.discount,
        selectedServices: newEvent.selectedServices,
        transferredFrom: newEvent.transferredFrom,
        transferredAt: newEvent.transferredAt,
        notes: newEvent.notes
      };
      
      // Chỉ thêm staffId và transferredBy nếu có trong newEvent (đã được validate ở trên)
      // QUAN TRỌNG: Kiểm tra cả undefined và null để đảm bảo chỉ thêm khi có giá trị hợp lệ
      if (newEvent.hasOwnProperty('staffId') && newEvent.staffId !== undefined && newEvent.staffId !== null) {
        checkinEventData.staffId = newEvent.staffId;
      }
      if (newEvent.hasOwnProperty('transferredBy') && newEvent.transferredBy !== undefined && newEvent.transferredBy !== null) {
        checkinEventData.transferredBy = newEvent.transferredBy;
      }
      
      console.log('Saving checkin event data:', {
        targetRoom: targetRoom.roomNumber,
        hasStaffId: checkinEventData.hasOwnProperty('staffId'),
        hasTransferredBy: checkinEventData.hasOwnProperty('transferredBy'),
        staffId: checkinEventData.staffId,
        transferredBy: checkinEventData.transferredBy
      });
      
      const savedEvent = await saveRoomEvent(targetRoom._id, targetRoom.hotelId, checkinEventData);
      
      // Kiểm tra xem event có được lưu thành công không
      if (!savedEvent || !savedEvent._id) {
        console.error('Failed to save checkin event to target room:', {
          targetRoom: targetRoom.roomNumber,
          targetRoomId: targetRoom._id,
          hotelId: targetRoom.hotelId
        });
        return res.status(500).json({ 
          error: 'Lỗi khi lưu thông tin check-in vào RoomEvent collection cho phòng đích' 
        });
      }
      
      console.log('Successfully saved checkin event to target room:', {
        eventId: savedEvent._id,
        targetRoom: targetRoom.roomNumber,
        checkinTime: savedEvent.checkinTime,
        guestInfo: savedEvent.guestInfo?.name || 'N/A'
      });
      
      // Đảm bảo guestStatus được set thành 'in' cho phòng đích
      targetRoom.guestStatus = 'in';
      
      // Cập nhật currentBooking nếu có - chuyển bookingId sang phòng đích
      if (sourceRoom.currentBooking) {
        // Nếu currentBooking là ObjectId, chuyển trực tiếp
        if (sourceRoom.currentBooking.toString && typeof sourceRoom.currentBooking.toString === 'function') {
          targetRoom.currentBooking = sourceRoom.currentBooking;
        } else if (sourceRoom.currentBooking._id) {
          // Nếu là object, lấy _id
          targetRoom.currentBooking = sourceRoom.currentBooking._id;
        } else {
          targetRoom.currentBooking = sourceRoom.currentBooking;
        }
        targetRoom.markModified('currentBooking');
        sourceRoom.currentBooking = null;
        sourceRoom.markModified('currentBooking');
      }
    }
    
    // Tạo checkout event cho phòng nguồn để đánh dấu event checkin đã được transfer
    // Điều này đảm bảo khi checkin lại phòng nguồn, không lấy event checkin cũ
    if (lastCheckinEvent && lastCheckinEvent.checkinTime) {
      // Đảm bảo checkinTime là Date object và giữ nguyên giá trị chính xác
      let checkinTime = lastCheckinEvent.checkinTime;
      if (!(checkinTime instanceof Date)) {
        checkinTime = new Date(checkinTime);
      }
      
      // Kiểm tra xem đã có checkout event chưa (so sánh chính xác checkinTime)
      const existingCheckout = await RoomEvent.findOne({
        roomId: sourceRoomId,
        type: 'checkout',
        checkinTime: checkinTime
      });
      
      // Nếu chưa có checkout event, tạo một checkout event đặc biệt để đánh dấu đã transfer
      if (!existingCheckout) {
        try {
          // QUAN TRỌNG: Chỉ thêm staffId nếu staffIdObjectId hợp lệ (không phải null)
          const checkoutEventData = {
            type: 'checkout',
            checkinTime: checkinTime, // Giữ nguyên checkinTime chính xác từ event cũ
            checkoutTime: new Date(), // Thời gian transfer
            userId: lastCheckinEvent.userId || null,
            guestInfo: lastCheckinEvent.guestInfo || {},
            paymentMethod: lastCheckinEvent.paymentMethod || 'cash',
            rateType: lastCheckinEvent.rateType || 'hourly',
            advancePayment: lastCheckinEvent.advancePayment || 0,
            additionalCharges: lastCheckinEvent.additionalCharges || 0,
            discount: lastCheckinEvent.discount || 0,
            selectedServices: lastCheckinEvent.selectedServices || [],
            notes: `Chuyển phòng sang ${targetRoom.roomNumber}. ${notes || ''}`.trim(),
            transferredTo: targetRoomId // Đánh dấu đã chuyển sang phòng nào
          };
          
          // Chỉ thêm staffId nếu hợp lệ
          if (staffIdObjectId) {
            checkoutEventData.staffId = staffIdObjectId;
          }
          
          const checkoutEvent = await saveRoomEvent(sourceRoomId, sourceRoom.hotelId, checkoutEventData);
          
          console.log('Created checkout event for transferred room:', {
            sourceRoom: sourceRoom.roomNumber,
            targetRoom: targetRoom.roomNumber,
            checkinTime: checkinTime.toISOString(),
            checkoutEventId: checkoutEvent?._id
          });
        } catch (error) {
          console.error('Error creating checkout event for transferred room:', error);
          // Không throw error ở đây vì event checkin đã được tạo cho phòng đích
          // Chỉ log để debug
        }
      } else {
        console.log('Checkout event already exists for transferred room:', {
          sourceRoom: sourceRoom.roomNumber,
          checkinTime: checkinTime.toISOString(),
          existingCheckoutId: existingCheckout._id
        });
      }
    }
    
    // Cập nhật trạng thái phòng - phòng cũ chuyển sang dirty sau khi đã transfer thông tin khách
    sourceRoom.status = 'dirty';
    sourceRoom.guestStatus = null; // Xóa guestStatus của phòng cũ
    targetRoom.status = 'occupied';
    targetRoom.guestStatus = 'in'; // Đảm bảo phòng mới có guestStatus = 'in'
    
    // Thêm vào lịch sử của phòng nguồn
    if (!sourceRoom.bookingHistory) {
      sourceRoom.bookingHistory = [];
    }
    
    sourceRoom.bookingHistory.push({
      event: 'transfer',
      date: new Date(),
      staffId: staffId,
      targetRoomId: targetRoomId,
      targetRoomNumber: targetRoom.roomNumber,
      notes: notes || 'Chuyển phòng'
    });
    
    sourceRoom.markModified('bookingHistory');
    
    // Lưu cả hai phòng với validateBeforeSave để tránh lỗi
    await Promise.all([
      sourceRoom.save({ validateBeforeSave: false }),
      targetRoom.save({ validateBeforeSave: false })
    ]);
    
    // Lấy lại event check-in mới từ RoomEvent collection để trả về cho frontend
    let newCheckinEvent = null;
    if (lastCheckinEvent) {
      const latestCheckinEvent = await RoomEvent.findOne({
        roomId: targetRoom._id,
        type: 'checkin',
        transferredFrom: sourceRoom._id
      })
        .sort({ createdAt: -1 })
        .lean();
      
      if (latestCheckinEvent) {
        newCheckinEvent = {
          checkinTime: latestCheckinEvent.checkinTime,
          guestInfo: latestCheckinEvent.guestInfo,
          rateType: latestCheckinEvent.rateType,
          advancePayment: latestCheckinEvent.advancePayment || 0,
          additionalCharges: latestCheckinEvent.additionalCharges || 0,
          discount: latestCheckinEvent.discount || 0,
          selectedServices: latestCheckinEvent.selectedServices || [],
          paymentMethod: latestCheckinEvent.paymentMethod || 'cash',
          expectedCheckoutTime: latestCheckinEvent.expectedCheckoutTime,
          transferredFrom: latestCheckinEvent.transferredFrom,
          transferredAt: latestCheckinEvent.transferredAt
        };
      }
    }
    
    // Tạo thông báo tự động cho chuyển phòng
    const guestName = lastCheckinEvent?.guestInfo?.name || 'Khách lẻ';
    createAutoAnnouncement('transfer', sourceRoom.hotelId, sourceRoom._id, sourceRoom.roomNumber, guestName, {
      fromRoom: sourceRoom.roomNumber,
      toRoom: targetRoom.roomNumber
    }).catch(err => console.error('Error creating transfer announcement:', err));
    
    res.status(200).json({
      message: 'Chuyển phòng thành công',
      sourceRoom,
      targetRoom,
      booking: booking || null,
      checkinEvent: newCheckinEvent // Trả về thông tin check-in mới cho frontend
    });
  } catch (error) {
    console.error('Error transferring room:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      sourceRoomId: req.body?.sourceRoomId,
      targetRoomId: req.body?.targetRoomId,
      staffId: req.body?.staffId
    });
    res.status(500).json({ 
      error: 'Lỗi khi chuyển phòng', 
      details: error.message,
      ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {})
    });
  }
}

// Đặt phòng trước (Booking/Reservation)
async function createRoomBooking(req, res) {
  try {
    const { roomId, hotelId, guestInfo, checkInDate, checkOutDate, rateType, notes, advancePayment, advancePaymentMethod, guestEmail, guestIdNumber } = req.body;
    
    // Merge guestInfo với các trường riêng lẻ nếu có
    const finalGuestInfo = {
      ...guestInfo,
      email: guestInfo?.email || guestEmail || '',
      idNumber: guestInfo?.idNumber || guestIdNumber || ''
    };
    
    // Kiểm tra phòng
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    const requestedCheckIn = new Date(checkInDate);
    const requestedCheckOut = checkOutDate ? new Date(checkOutDate) : null;
    const now = new Date();
    
    // Validation: Kiểm tra checkOutDate phải sau checkInDate
    if (requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
      return res.status(400).json({ 
        message: 'Ngày trả phòng phải sau ngày nhận phòng' 
      });
    }
    
    // Validation: Kiểm tra checkInDate không được trong quá khứ (trừ hôm nay)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bookingDate = new Date(requestedCheckIn);
    bookingDate.setHours(0, 0, 0, 0);
    
    // Cho phép đặt cho hôm nay hoặc tương lai
    if (bookingDate < today) {
      return res.status(400).json({ 
        message: 'Không thể đặt phòng cho ngày đã qua' 
      });
    }
    
    // Kiểm tra nếu phòng đang occupied
    if (room.status === 'occupied') {
      // Kiểm tra xem ngày đặt có trùng với thời gian khách đang ở không
      // CHỈ SỬ DỤNG RoomEvent collection, không sử dụng room.events nữa
      const lastCheckinEvent = await getLastUncheckedOutCheckinEvent(room._id);
      if (lastCheckinEvent && lastCheckinEvent.checkinTime) {
        const checkinTime = new Date(lastCheckinEvent.checkinTime);
        // Nếu ngày đặt trước hoặc sau thời gian khách đang ở, vẫn có thể đặt
        if (requestedCheckOut && requestedCheckOut <= checkinTime) {
          // Ngày đặt không trùng với thời gian occupied, cho phép đặt
        } else if (requestedCheckIn >= now && requestedCheckIn > checkinTime) {
          // Ngày đặt trong tương lai và sau thời gian occupied, cho phép đặt
        } else {
          return res.status(400).json({ 
            message: 'Phòng đang có khách. Không thể đặt vào thời gian này. Vui lòng chọn ngày khác.' 
          });
        }
      } else {
        // Không có thông tin checkin, không cho đặt
        return res.status(400).json({ 
          message: 'Phòng đang có khách. Không thể đặt vào thời gian này.' 
        });
      }
    }
    
    // Kiểm tra conflict với các booking khác từ RoomEvent collection
    // CHỈ KIỂM TRA các booking CHƯA BỊ HỦY (để phòng có thể được đặt lại cho khoảng thời gian đã hủy)
    const bookingEvents = await RoomEvent.find({
      roomId: room._id,
      type: 'booking'
    }).lean();
    
    if (bookingEvents && bookingEvents.length > 0) {
      for (const booking of bookingEvents) {
        // Bỏ qua các booking đã bị hủy
        const isCancelled = booking.notes && (booking.notes.includes('[Đã hủy]') || booking.notes.includes('cancelled'));
        if (isCancelled) {
          continue; // Bỏ qua booking đã hủy, cho phép đặt lại cho khoảng thời gian này
        }
        
        // Kiểm tra xem booking có status 'checked_in' không (đã check-in)
        // Nếu đã check-in, vẫn kiểm tra conflict vì phòng đang occupied
        let isCheckedIn = false;
        if (booking.bookingId) {
          try {
            const bookingDoc = await Booking.findById(booking.bookingId).lean();
            if (bookingDoc && bookingDoc.status === 'checked_in') {
              isCheckedIn = true;
            }
          } catch (err) {
            // Ignore error, tiếp tục kiểm tra
          }
        }
        
        // Nếu booking đã check-in, phòng đang occupied, đã được xử lý ở trên
        // Chỉ kiểm tra conflict với các booking chưa check-in
        if (!isCheckedIn && booking.checkinTime && booking.expectedCheckoutTime) {
          const existingCheckIn = new Date(booking.checkinTime);
          const existingCheckOut = new Date(booking.expectedCheckoutTime);
          
          // Kiểm tra overlap
          const hasOverlap = (
            (requestedCheckIn >= existingCheckIn && requestedCheckIn < existingCheckOut) ||
            (requestedCheckOut && requestedCheckOut > existingCheckIn && requestedCheckOut <= existingCheckOut) ||
            (requestedCheckIn <= existingCheckIn && requestedCheckOut && requestedCheckOut >= existingCheckOut)
          );
          
          if (hasOverlap) {
            return res.status(400).json({ 
              message: `Phòng đã được đặt từ ${existingCheckIn.toLocaleString('vi-VN')} đến ${existingCheckOut.toLocaleString('vi-VN')}. Vui lòng chọn ngày khác.` 
            });
          }
        }
      }
    }
    
    // Kiểm tra currentBooking nếu có
    if (room.currentBooking && room.status === 'booked') {
      const currentCheckIn = new Date(room.currentBooking.checkInDate);
      const currentCheckOut = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
      
      if (currentCheckOut) {
        const hasOverlap = (
          (requestedCheckIn >= currentCheckIn && requestedCheckIn < currentCheckOut) ||
          (requestedCheckOut && requestedCheckOut > currentCheckIn && requestedCheckOut <= currentCheckOut) ||
          (requestedCheckIn <= currentCheckIn && requestedCheckOut && requestedCheckOut >= currentCheckOut)
        );
        
        if (hasOverlap) {
          return res.status(400).json({ 
            message: `Phòng đã được đặt từ ${currentCheckIn.toLocaleString('vi-VN')} đến ${currentCheckOut.toLocaleString('vi-VN')}. Vui lòng chọn ngày khác.` 
          });
        }
      }
    }
    
    // Tạo booking event
    const bookingEvent = {
      type: 'booking',
      guestInfo: finalGuestInfo,
      checkinTime: new Date(checkInDate),
      expectedCheckoutTime: checkOutDate ? new Date(checkOutDate) : null,
      rateType: rateType || 'hourly',
      advancePayment: advancePayment || 0,
      advancePaymentMethod: advancePaymentMethod || 'cash',
      notes: notes || '',
      createdAt: new Date()
    };
    
    // Lưu event vào RoomEvent collection và room document
    const savedRoomEvent = await saveEventToBoth(room, bookingEvent);
    
    // Kiểm tra xem ngày đặt có phải hôm nay hoặc đã qua không
    const todayForStatus = new Date();
    todayForStatus.setHours(0, 0, 0, 0);
    const bookingDateForStatus = new Date(checkInDate);
    bookingDateForStatus.setHours(0, 0, 0, 0);
    const isBookingTodayOrPast = bookingDateForStatus <= todayForStatus;
    
    // Chỉ cập nhật trạng thái phòng thành "booked" nếu:
    // 1. Phòng đang vacant VÀ
    // 2. Ngày đặt là hôm nay hoặc đã qua
    if (room.status === 'vacant' && isBookingTodayOrPast) {
      room.status = 'booked';
      room.currentBooking = {
        guestInfo: finalGuestInfo,
        checkInDate: new Date(checkInDate),
        checkOutDate: checkOutDate ? new Date(checkOutDate) : null,
        rateType,
        advancePayment: advancePayment || 0,
        advancePaymentMethod: advancePaymentMethod || 'cash',
        notes
      };
    } else if (room.status === 'vacant' && !isBookingTodayOrPast) {
      // Đặt phòng vào ngày tương lai, không đổi status, chỉ lưu vào events
      // Phòng vẫn có thể nhận khách bình thường
      // Không cập nhật currentBooking vì đây là booking tương lai
    } else if (room.status === 'booked') {
      // Phòng đã được đặt, nhưng có thể đặt thêm nếu không trùng thời gian
      // Chỉ lưu vào events, không thay đổi currentBooking
    } else {
      // Phòng đang occupied hoặc trạng thái khác, chỉ thêm booking vào events
      // Phòng vẫn có thể nhận khách nếu không trùng thời gian
    }
    
    // Thêm vào lịch sử
    if (!room.bookingHistory) {
      room.bookingHistory = [];
    }
    room.bookingHistory.push({
      event: 'booking',
      date: new Date(),
      customerName: finalGuestInfo?.name || 'Khách đặt trước',
      customerPhone: finalGuestInfo?.phone || '',
      customerEmail: finalGuestInfo?.email || '',
      notes: notes || 'Đặt phòng trước',
      rateType,
      checkInTime: new Date(checkInDate),
      checkOutTime: checkOutDate ? new Date(checkOutDate) : null,
      guestInfo: finalGuestInfo,
      advancePayment: advancePayment || 0,
      paymentMethod: advancePaymentMethod || 'cash'
    });
    
    await room.save();

    const depositAmount = Number(advancePayment || 0);
    if (depositAmount > 0) {
      let txMethod = String(advancePaymentMethod || 'cash').toLowerCase().trim();
      if (txMethod === 'transfer') txMethod = 'bank_transfer';
      if (txMethod === 'credit_card') txMethod = 'card';
      if (!['cash', 'bank_transfer', 'card', 'credit_card', 'virtual_card', 'other'].includes(txMethod)) {
        txMethod = 'cash';
      }

      const roomEventId = savedRoomEvent?._id ? String(savedRoomEvent._id) : null;
      const existingTx = roomEventId
        ? await Transaction.findOne({
            hotelId: new mongoose.Types.ObjectId(room.hotelId),
            type: 'income',
            incomeCategory: 'deposit',
            'metadata.source': 'booking_advance',
            'metadata.roomEventId': roomEventId
          }).lean()
        : null;

      if (!existingTx) {
        const tx = new Transaction({
          hotelId: new mongoose.Types.ObjectId(room.hotelId),
          staffId: req.body.staffId && mongoose.Types.ObjectId.isValid(req.body.staffId) ? new mongoose.Types.ObjectId(req.body.staffId) : undefined,
          type: 'income',
          incomeCategory: 'deposit',
          amount: depositAmount,
          method: txMethod,
          status: 'completed',
          description: `[Đặt trước] Phòng ${room.roomNumber}`,
          notes: notes || '',
          processedBy: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
          processedAt: new Date(),
          metadata: {
            source: 'booking_advance',
            roomId: String(room._id),
            roomNumber: String(room.roomNumber || ''),
            roomEventId: roomEventId,
            checkInDate: checkInDate,
            checkOutDate: checkOutDate || null,
            guestName: finalGuestInfo?.name || null,
          }
        });
        await tx.save();
        await deleteCachePattern(`transactions:income:${String(room.hotelId)}:*`);
      }
    }
    
    // Tạo thông báo tự động cho booking
    const guestName = finalGuestInfo?.name || 'Khách đặt trước';
    createAutoAnnouncement('booking', room.hotelId, room._id, room.roomNumber, guestName, {
      checkInDate: checkInDate,
      checkOutDate: checkOutDate
    }).catch(err => console.error('Error creating booking announcement:', err));
    
    res.status(201).json({
      message: 'Đặt phòng thành công',
      room,
      booking: bookingEvent
    });
  } catch (error) {
    console.error('Error creating room booking:', error);
    res.status(500).json({ message: error.message });
  }
}

// Lấy danh sách bookings theo room hoặc hotel
async function getRoomBookings(req, res) {
  try {
    const { roomId, hotelId, startDate, endDate } = req.query;
    const userRole = req.user?.role;
    const userHotelId = req.user?.hotelId;
    
    let query = {};
    
    // Staff chỉ được xem bookings của hotel mà họ trực thuộc
    if (userRole === 'staff') {
      if (userHotelId) {
        query.hotelId = userHotelId;
      } else {
        return res.status(200).json([]);
      }
    } else {
      if (roomId) {
        query.roomId = roomId;
      }
      if (hotelId) {
        query.hotelId = hotelId;
      } else if (userRole === 'hotel' && userHotelId) {
        // Hotel manager chỉ xem bookings của hotel mình
        query.hotelId = userHotelId;
      } else if (userRole === 'business' && req.user?.businessId) {
        // Business chỉ xem bookings của hotels thuộc business
        const { Hotel } = require('../models/hotel');
        const hotels = await Hotel.find({ businessId: req.user.businessId }).select('_id');
        const hotelIds = hotels.map(h => h._id);
        query.hotelId = { $in: hotelIds };
      }
    }
    
    // Lấy phòng và filter bookings từ events
    const rooms = await Room.find(query);
    const bookings = [];
    
    // Lấy tất cả booking events từ RoomEvent collection cho tất cả các phòng
    let finalHotelIdForEvents = hotelId;
    if (userRole === 'staff' && userHotelId) {
      finalHotelIdForEvents = userHotelId.toString();
    } else if (userRole === 'hotel' && userHotelId) {
      finalHotelIdForEvents = userHotelId.toString();
    } else if (userRole === 'business' && req.user?.businessId && !hotelId) {
      // Business: lấy tất cả hotels thuộc business
      const { Hotel } = require('../models/hotel');
      const hotels = await Hotel.find({ businessId: req.user.businessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      // Không filter theo hotelId trong RoomEvent nếu là business (sẽ filter ở rooms query)
      finalHotelIdForEvents = null;
    }
    
    const allBookingEvents = await RoomEvent.find({
      type: 'booking',
      ...(finalHotelIdForEvents ? { hotelId: finalHotelIdForEvents } : {})
    }).lean();
    
    // Tạo map để nhóm events theo roomId
    const eventsByRoomId = {};
    allBookingEvents.forEach(event => {
      if (!eventsByRoomId[event.roomId]) {
        eventsByRoomId[event.roomId] = [];
      }
      eventsByRoomId[event.roomId].push(event);
    });
    
    for (const room of rooms) {
      const bookingEvents = eventsByRoomId[room._id.toString()] || [];
      
      for (const event of bookingEvents) {
        const checkinTime = event.checkinTime ? new Date(event.checkinTime) : null;
        const checkoutTime = event.expectedCheckoutTime ? new Date(event.expectedCheckoutTime) : null;
        
        // Filter theo ngày nếu có
        if (startDate || endDate) {
          const eventDate = checkinTime || new Date(event.createdAt);
          if (startDate && eventDate < new Date(startDate)) continue;
          if (endDate && eventDate > new Date(endDate)) continue;
        }
        
        // Kiểm tra xem booking đã bị hủy chưa từ event notes
        const isCancelled = event.notes && (event.notes.includes('[Đã hủy]') || event.notes.includes('cancelled'));
        
        // Lấy status từ Booking collection nếu có bookingId
        let bookingStatus = 'booked'; // Default status
        if (event.bookingId) {
          try {
            const booking = await Booking.findById(event.bookingId).lean();
            if (booking) {
              // Ưu tiên status từ Booking collection
              bookingStatus = booking.status || 'booked';
            }
          } catch (bookingError) {
            console.error('Error loading booking status:', bookingError);
            // Fallback về logic cũ
            bookingStatus = isCancelled ? 'cancelled' : (room.status === 'booked' ? 'booked' : 'pending');
          }
        } else {
          // Nếu không có bookingId, sử dụng logic cũ
          bookingStatus = isCancelled ? 'cancelled' : (room.status === 'booked' ? 'booked' : 'pending');
        }
        
        // Nếu event đã bị hủy, đảm bảo status là 'cancelled'
        if (isCancelled) {
          bookingStatus = 'cancelled';
        }
        
        bookings.push({
          _id: event._id || `${room._id}_${event.createdAt}`,
          roomId: room._id,
          roomNumber: room.roomNumber,
          hotelId: room.hotelId,
          guestInfo: event.guestInfo || {},
          checkInDate: checkinTime,
          checkOutDate: checkoutTime,
          rateType: event.rateType || 'hourly',
          advancePayment: event.advancePayment || 0,
          notes: event.notes || '',
          status: bookingStatus,
          createdAt: event.createdAt || new Date(),
          bookingId: event.bookingId || null // Thêm bookingId để frontend có thể sử dụng
        });
      }
      
      // Cũng kiểm tra currentBooking nếu có
      if (room.currentBooking && room.status === 'booked') {
        const checkinTime = room.currentBooking.checkInDate ? new Date(room.currentBooking.checkInDate) : null;
        const checkoutTime = room.currentBooking.checkOutDate ? new Date(room.currentBooking.checkOutDate) : null;
        
        // Filter theo ngày nếu có
        if (startDate || endDate) {
          const eventDate = checkinTime || new Date();
          if (startDate && eventDate < new Date(startDate)) continue;
          if (endDate && eventDate > new Date(endDate)) continue;
        }
        
        bookings.push({
          _id: `${room._id}_current`,
          roomId: room._id,
          roomNumber: room.roomNumber,
          hotelId: room.hotelId,
          guestInfo: room.currentBooking.guestInfo || {},
          checkInDate: checkinTime,
          checkOutDate: checkoutTime,
          rateType: room.currentBooking.rateType || 'hourly',
          advancePayment: room.currentBooking.advancePayment || 0,
          notes: room.currentBooking.notes || '',
          status: 'booked',
          createdAt: new Date()
        });
      }
    }
    
    res.status(200).json({
      message: 'Lấy danh sách bookings thành công',
      bookings: bookings.sort((a, b) => {
        const dateA = a.checkInDate ? new Date(a.checkInDate).getTime() : 0;
        const dateB = b.checkInDate ? new Date(b.checkInDate).getTime() : 0;
        return dateA - dateB;
      })
    });
  } catch (error) {
    console.error('Error getting room bookings:', error);
    res.status(500).json({ message: error.message });
  }
}

// Hủy đặt phòng
async function cancelRoomBooking(req, res) {
  try {
    const { roomId } = req.params;
    const { reason, bookingId, checkInDate } = req.body;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    // Kiểm tra trạng thái - chỉ có thể hủy nếu là booked hoặc vacant
    if (room.status !== 'booked' && room.status !== 'vacant') {
      return res.status(400).json({ message: 'Không thể hủy đặt phòng với trạng thái hiện tại' });
    }
    
    // Tìm và đánh dấu booking events là cancelled từ RoomEvent collection
    const bookingEvents = await RoomEvent.find({
      roomId: room._id,
      type: 'booking'
    });
    
    for (const event of bookingEvents) {
      // Nếu có bookingId, so sánh với event.bookingId hoặc event._id
      // Nếu có checkInDate, so sánh với checkinTime
      let shouldCancel = false;
      
      if (bookingId) {
        // So sánh với event.bookingId (từ Booking collection) hoặc event._id (RoomEvent ID)
        if (event.bookingId && event.bookingId.toString() === bookingId.toString()) {
          shouldCancel = true;
        } else if (event._id && event._id.toString() === bookingId.toString()) {
          shouldCancel = true;
        }
      } else if (checkInDate) {
        const eventCheckIn = event.checkinTime ? new Date(event.checkinTime).getTime() : null;
        const requestCheckIn = new Date(checkInDate).getTime();
        // Cho phép hủy nếu trùng trong vòng 1 giờ
        if (eventCheckIn && Math.abs(eventCheckIn - requestCheckIn) < 60 * 60 * 1000) {
          shouldCancel = true;
        }
      } else {
        // Nếu không có bookingId hoặc checkInDate, hủy booking gần nhất chưa bị hủy
        const isCancelled = event.notes && event.notes.includes('[Đã hủy]');
        if (!isCancelled) {
          shouldCancel = true;
        }
      }
      
      if (shouldCancel) {
        // Đánh dấu booking event là đã hủy
        event.notes = (event.notes || '') + (event.notes ? ' ' : '') + '[Đã hủy]';
        event.cancelledAt = new Date();
        event.cancelReason = reason || 'Hủy đặt phòng';
        await event.save();
        
        // Cập nhật Booking collection nếu có bookingId trong event
        if (event.bookingId) {
          try {
            const booking = await Booking.findById(event.bookingId);
            if (booking && booking.status !== 'cancelled' && booking.status !== 'checked_out') {
              booking.status = 'cancelled';
              if (reason) {
                booking.logs = booking.logs || [];
                booking.logs.push({
                  action: 'cancel',
                  staffId: req.user?._id || req.body.staffId || null,
                  details: `Hủy đặt phòng. Lý do: ${reason}`,
                  timestamp: new Date()
                });
              }
              await booking.save({ validateBeforeSave: false });
              console.log(`Booking ${event.bookingId} từ RoomEvent đã được cập nhật status thành 'cancelled'`);
            }
          } catch (bookingError) {
            console.error('Error updating booking status from event:', bookingError);
            // Không throw error, tiếp tục xử lý
          }
        }
      }
    }
    
    // Thêm sự kiện hủy đặt phòng
    const cancelEvent = {
      type: 'cancel_booking',
      notes: reason || 'Hủy đặt phòng',
      cancelledAt: new Date(),
      cancelReason: reason || 'Hủy đặt phòng'
    };
    
    // Lưu event vào RoomEvent collection và room document
    await saveEventToBoth(room, cancelEvent);
    
    // Cập nhật trạng thái - chỉ đổi thành vacant nếu đang booked
    if (room.status === 'booked') {
      room.status = 'vacant';
      room.currentBooking = null;
      // Reset guestStatus khi phòng chuyển sang vacant
      room.guestStatus = null;
    }
    
    // Lấy thông tin khách từ booking event để tạo thông báo
    let guestName = 'Khách đặt trước';
    if (bookingEvents && bookingEvents.length > 0) {
      const cancelledEvent = bookingEvents.find(e => e.cancelledAt);
      if (cancelledEvent && cancelledEvent.guestInfo) {
        guestName = cancelledEvent.guestInfo.name || 'Khách đặt trước';
      } else if (room.currentBooking && room.currentBooking.guestInfo) {
        guestName = room.currentBooking.guestInfo.name || 'Khách đặt trước';
      }
    }
    
    // Tạo thông báo tự động cho cancellation
    createAutoAnnouncement('cancellation', room.hotelId, room._id, room.roomNumber, guestName, {
      reason: reason || 'Hủy đặt phòng'
    }).catch(err => console.error('Error creating cancellation announcement:', err));
    
    // Cập nhật Booking model nếu có bookingId (fallback nếu không tìm thấy trong loop trên)
    if (bookingId) {
      try {
        const booking = await Booking.findById(bookingId);
        if (booking && booking.status !== 'cancelled' && booking.status !== 'checked_out') {
          booking.status = 'cancelled';
          if (reason) {
            booking.logs = booking.logs || [];
            booking.logs.push({
              action: 'cancel',
              staffId: req.user?._id || req.body.staffId || null,
              details: `Hủy đặt phòng. Lý do: ${reason}`,
              timestamp: new Date()
            });
          }
          await booking.save({ validateBeforeSave: false });
          console.log(`Booking ${bookingId} đã được cập nhật status thành 'cancelled'`);
        }
      } catch (bookingError) {
        console.error('Error updating booking status:', bookingError);
        // Không throw error, chỉ log vì room đã được cập nhật
      }
    }
    
    // Thêm vào lịch sử
    if (!room.bookingHistory) {
      room.bookingHistory = [];
    }
    room.bookingHistory.push({
      event: 'cancel_booking',
      date: new Date(),
      notes: reason || 'Hủy đặt phòng'
    });
    
    await room.save();
    
    res.status(200).json({
      message: 'Đã hủy đặt phòng thành công',
      room
    });
  } catch (error) {
    console.error('Error cancelling room booking:', error);
    res.status(500).json({ message: error.message });
  }
}

// Khách tạm ra ngoài
async function guestOut(req, res) {
  try {
    const { roomId } = req.params;
    const { note, staffId } = req.body;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    if (room.status !== 'occupied') {
      return res.status(400).json({ message: 'Phòng không có khách để đánh dấu ra ngoài' });
    }
    
    // Lấy thông tin khách từ checkin event chưa checkout
    let guestInfo = null;
    const lastCheckinEvent = await getLastUncheckedOutCheckinEvent(roomId);
    if (lastCheckinEvent && lastCheckinEvent.guestInfo) {
      guestInfo = lastCheckinEvent.guestInfo;
    }
    
    // Thêm sự kiện khách ra ngoài vào RoomEvent collection
    const guestOutEvent = {
      type: 'guest_out',
      notes: note || '',
      staffId: staffId || null,
      guestInfo: guestInfo || null,
      createdAt: new Date()
    };
    
    // Lưu event vào RoomEvent collection
    await saveRoomEvent(room._id, room.hotelId, guestOutEvent);
    
    // Đánh dấu phòng là khách đang ở ngoài (vẫn giữ status occupied)
    room.guestStatus = 'out';
    
    await room.save();
    
    res.status(200).json({
      message: 'Đã ghi nhận khách ra ngoài',
      room
    });
  } catch (error) {
    console.error('Error marking guest out:', error);
    res.status(500).json({ message: error.message });
  }
}

// Khách quay lại
async function guestReturn(req, res) {
  try {
    const { roomId } = req.params;
    const { staffId } = req.body;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    if (room.status !== 'occupied') {
      return res.status(400).json({ message: 'Phòng không có khách' });
    }
    
    // Kiểm tra xem khách có đang ở ngoài không
    if (room.guestStatus !== 'out') {
      return res.status(400).json({ message: 'Khách không ở trạng thái ra ngoài' });
    }
    
    // Lấy thông tin khách từ checkin event chưa checkout
    let guestInfo = null;
    const lastCheckinEvent = await getLastUncheckedOutCheckinEvent(roomId);
    if (lastCheckinEvent && lastCheckinEvent.guestInfo) {
      guestInfo = lastCheckinEvent.guestInfo;
    }
    
    // Thêm sự kiện khách quay lại vào RoomEvent collection
    const guestReturnEvent = {
      type: 'guest_return',
      staffId: staffId || null,
      guestInfo: guestInfo || null,
      createdAt: new Date()
    };
    
    // Lưu event vào RoomEvent collection
    await saveRoomEvent(room._id, room.hotelId, guestReturnEvent);
    
    // Đánh dấu khách đã về
    room.guestStatus = 'in';
    
    await room.save();
    
    res.status(200).json({
      message: 'Đã ghi nhận khách quay lại',
      room
    });
  } catch (error) {
    console.error('Error marking guest return:', error);
    res.status(500).json({ message: error.message });
  }
}

// Cập nhật thông tin khách và tiền đặt trước
async function updateRoomCheckinInfo(req, res) {
  try {
    const { id: roomId } = req.params;
    const { guestInfo, advancePayment, rateType, additionalCharges, discount, selectedServices, advancePaymentMethod } = req.body;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    if (room.status !== 'occupied') {
      return res.status(400).json({ message: 'Phòng không có khách' });
    }
    
    // Tìm event check-in cuối cùng CHƯA CHECKOUT
    let lastCheckinEvent = null;
    let updatedRoomEvent = null;
    
    // Lấy từ RoomEvent collection (chưa checkout)
    lastCheckinEvent = await getLastUncheckedOutCheckinEvent(roomId);
    
    if (lastCheckinEvent) {
      // Cập nhật RoomEvent collection (không cập nhật room.events nữa)
      try {
        // Tìm event check-in chưa checkout từ RoomEvent collection
        const uncheckedOutCheckinEvent = await getLastUncheckedOutCheckinEvent(roomId);
        
        if (uncheckedOutCheckinEvent) {
          // Cập nhật RoomEvent với thông tin mới
          const roomEvent = await RoomEvent.findById(uncheckedOutCheckinEvent._id);
          
          if (roomEvent) {
            if (guestInfo) {
              // Merge guestInfo mới với guestInfo cũ trong RoomEvent
              const currentGuestInfo = roomEvent.guestInfo || {};
              const newGuestSource = guestInfo.guestSource !== undefined && guestInfo.guestSource !== null 
                ? guestInfo.guestSource 
                : (currentGuestInfo.guestSource || 'walkin');
              
              roomEvent.guestInfo = {
                ...currentGuestInfo,
                ...guestInfo,
                name: guestInfo.name || currentGuestInfo.name || 'Khách lẻ',
                idNumber: guestInfo.idNumber || currentGuestInfo.idNumber || '',
                phone: guestInfo.phone || currentGuestInfo.phone || '',
                email: guestInfo.email || currentGuestInfo.email || '',
                address: guestInfo.address || currentGuestInfo.address || '',
                guestSource: newGuestSource
              };
              
              console.log('Updating RoomEvent guestInfo with guestSource:', {
                guestInfoGuestSource: guestInfo.guestSource,
                currentGuestInfoGuestSource: currentGuestInfo.guestSource,
                newGuestSource: newGuestSource
              });
            }
            
            if (advancePayment !== undefined && advancePayment !== null) {
              roomEvent.advancePayment = Number(advancePayment) || 0;
            }
            
            if (advancePaymentMethod !== undefined && advancePaymentMethod !== null) {
              roomEvent.advancePaymentMethod = advancePaymentMethod;
            }
            
            // Cập nhật additionalCharges nếu có
            if (additionalCharges !== undefined && additionalCharges !== null) {
              roomEvent.additionalCharges = Number(additionalCharges) || 0;
            }
            
            // Cập nhật discount nếu có
            if (discount !== undefined && discount !== null) {
              roomEvent.discount = Number(discount) || 0;
            }
            
            // Cập nhật rateType nếu có
            if (rateType !== undefined && rateType !== null) {
              roomEvent.rateType = rateType;
              console.log('Updated RoomEvent rateType to:', rateType);
            }
            
            // Cập nhật selectedServices nếu có
            if (selectedServices !== undefined && selectedServices !== null) {
              // Đảm bảo selectedServices là array hợp lệ
              if (Array.isArray(selectedServices)) {
                roomEvent.selectedServices = selectedServices.map(service => ({
                  serviceId: service.serviceId || null,
                  serviceName: service.serviceName || service.name || 'Dịch vụ',
                  price: service.price || 0,
                  quantity: service.quantity || 1,
                  totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1),
                  orderTime: service.orderTime || new Date()
                }));
                console.log('Updated RoomEvent selectedServices:', roomEvent.selectedServices.length, 'services');
              } else {
                console.warn('selectedServices is not an array, ignoring');
              }
            }
            
            await roomEvent.save();
            console.log('RoomEvent updated successfully:', {
              additionalCharges: roomEvent.additionalCharges,
              discount: roomEvent.discount,
              advancePayment: roomEvent.advancePayment,
              selectedServicesCount: roomEvent.selectedServices?.length || 0
            });
            updatedRoomEvent = {
              _id: roomEvent._id,
              additionalCharges: roomEvent.additionalCharges,
              discount: roomEvent.discount,
              advancePayment: roomEvent.advancePayment,
              rateType: roomEvent.rateType,
              selectedServices: roomEvent.selectedServices,
              guestInfo: roomEvent.guestInfo
            };
          } else {
            return res.status(404).json({ message: 'Không tìm thấy RoomEvent để cập nhật' });
          }
        } else {
          // Fallback: Tìm từ RoomEvent collection bằng checkinTime
          const roomEvent = await RoomEvent.findOne({ 
            roomId: roomId, 
            type: 'checkin',
            checkinTime: lastCheckinEvent.checkinTime
          }).sort({ createdAt: -1 });
          
          if (roomEvent) {
            if (guestInfo) {
              const currentGuestInfo = roomEvent.guestInfo || {};
              const newRoomEventGuestSource = guestInfo.guestSource !== undefined && guestInfo.guestSource !== null 
                ? guestInfo.guestSource 
                : (currentGuestInfo.guestSource || 'walkin');
              
              roomEvent.guestInfo = {
                ...currentGuestInfo,
                ...guestInfo,
                name: guestInfo.name || currentGuestInfo.name || 'Khách lẻ',
                idNumber: guestInfo.idNumber || currentGuestInfo.idNumber || '',
                phone: guestInfo.phone || currentGuestInfo.phone || '',
                email: guestInfo.email || currentGuestInfo.email || '',
                address: guestInfo.address || currentGuestInfo.address || '',
                guestSource: newRoomEventGuestSource
              };
              console.log('Updating RoomEvent guestInfo with guestSource:', {
                guestInfoGuestSource: guestInfo.guestSource,
                currentGuestInfoGuestSource: currentGuestInfo.guestSource,
                newRoomEventGuestSource: newRoomEventGuestSource
              });
            }
            if (advancePayment !== undefined && advancePayment !== null) {
              roomEvent.advancePayment = Number(advancePayment) || 0;
            }
            // Cập nhật additionalCharges nếu có
            if (additionalCharges !== undefined && additionalCharges !== null) {
              roomEvent.additionalCharges = Number(additionalCharges) || 0;
            }
            // Cập nhật discount nếu có
            if (discount !== undefined && discount !== null) {
              roomEvent.discount = Number(discount) || 0;
            }
            if (rateType !== undefined && rateType !== null) {
              roomEvent.rateType = rateType;
              console.log('Updated RoomEvent rateType to:', rateType);
            }
            
            // Cập nhật selectedServices nếu có
            if (selectedServices !== undefined && selectedServices !== null) {
              // Đảm bảo selectedServices là array hợp lệ
              if (Array.isArray(selectedServices)) {
                roomEvent.selectedServices = selectedServices.map(service => ({
                  serviceId: service.serviceId || null,
                  serviceName: service.serviceName || service.name || 'Dịch vụ',
                  price: service.price || 0,
                  quantity: service.quantity || 1,
                  totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1),
                  orderTime: service.orderTime || new Date()
                }));
                console.log('Updated RoomEvent selectedServices:', roomEvent.selectedServices.length, 'services');
              } else {
                console.warn('selectedServices is not an array, ignoring');
              }
            }
            
            roomEvent.updatedAt = new Date();
            await roomEvent.save();
            console.log('Updated RoomEvent (fallback):', {
              _id: roomEvent._id,
              additionalCharges: roomEvent.additionalCharges,
              discount: roomEvent.discount,
              advancePayment: roomEvent.advancePayment
            });
            updatedRoomEvent = {
              _id: roomEvent._id,
              additionalCharges: roomEvent.additionalCharges,
              discount: roomEvent.discount,
              advancePayment: roomEvent.advancePayment,
              rateType: roomEvent.rateType,
              selectedServices: roomEvent.selectedServices,
              guestInfo: roomEvent.guestInfo
            };
          } else {
            return res.status(404).json({ message: 'Không tìm thấy RoomEvent để cập nhật' });
          }
        }
      } catch (roomEventError) {
        // Log lỗi nhưng không throw để không ảnh hưởng đến việc cập nhật room
        console.error('Error updating RoomEvent (non-critical):', roomEventError.message);
        // Vẫn trả về response để frontend biết đã xử lý
        return res.status(500).json({ 
          message: 'Lỗi khi cập nhật RoomEvent: ' + roomEventError.message 
        });
      }
    } else {
      console.log('No unchecked out checkin event found');
      return res.status(404).json({ message: 'Không tìm thấy event check-in để cập nhật' });
    }
    
    // Cập nhật currentBooking nếu có (chỉ khi không có lỗi ở trên)
    if (room.currentBooking) {
      try {
        const Booking = mongoose.model('Booking');
        const bookingId = room.currentBooking?._id
          ? room.currentBooking._id
          : (room.currentBooking?.toString ? room.currentBooking.toString() : null);
        const booking = bookingId ? await Booking.findById(bookingId) : null;
        if (booking) {
          if (guestInfo) {
            booking.guestDetails = {
              ...(booking.guestDetails || {}),
              name: guestInfo.name ?? booking.guestDetails?.name,
              phone: guestInfo.phone ?? booking.guestDetails?.phone,
              email: guestInfo.email ?? booking.guestDetails?.email,
              idNumber: guestInfo.idNumber ?? booking.guestDetails?.idNumber
            };
          }
          if (advancePayment !== undefined && advancePayment !== null) {
            // Cập nhật deposit nếu có (deposit tương đương với advancePayment)
            booking.deposit = Number(advancePayment) || 0;
          }
          if (additionalCharges !== undefined && additionalCharges !== null) {
            const normalizedCharges = Number(additionalCharges) || 0;
            booking.additionalCharges = normalizedCharges > 0
              ? [{ description: 'Phụ thu', amount: normalizedCharges, date: new Date() }]
              : [];
          }
          if (discount !== undefined && discount !== null) {
            const normalizedDiscount = Number(discount) || 0;
            booking.discounts = normalizedDiscount > 0
              ? [{ description: 'Khuyến mãi', amount: normalizedDiscount, date: new Date() }]
              : [];
          }
          if (rateType !== undefined && rateType !== null) {
            const normalizedRateType = rateType === 'hourly' || rateType === 'daily' || rateType === 'nightly'
              ? rateType
              : null;
            if (normalizedRateType) {
              booking.bookingType = normalizedRateType;
            }
          }
          if (selectedServices !== undefined && selectedServices !== null && Array.isArray(selectedServices)) {
            booking.services = selectedServices.map(service => ({
              serviceId: service.serviceId || null,
              name: service.serviceName || service.name || 'Dịch vụ',
              quantity: service.quantity || 1,
              unitPrice: service.price || 0,
              totalPrice: service.totalPrice || (service.price || 0) * (service.quantity || 1),
              date: service.orderTime || new Date()
            }));
          }
          
          // Lưu booking mà không validate để tránh lỗi với các trường required
          await booking.save({ validateBeforeSave: false });
          console.log('Updated booking:', {
            bookingId: booking._id,
            guestDetails: booking.guestDetails,
            deposit: booking.deposit
          });
        }
      } catch (bookingError) {
        // Log lỗi nhưng không throw để không ảnh hưởng đến việc cập nhật room
        console.error('Error updating booking (non-critical):', bookingError.message);
      }
    }
    
    await room.save();
    
    return res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin thành công',
      data: updatedRoomEvent
        ? { roomEvent: updatedRoomEvent }
        : undefined
    });
  } catch (error) {
    console.error('Error updating checkin info:', error);
    res.status(500).json({ message: error.message });
  }
}

// Lấy events riêng từ RoomEvent collection
async function getRoomEventsById(req, res) {
  try {
    const { id: roomId } = req.params;
    const { limit = 1000, skip = 0, type, startDate, endDate, excludeCheckedOut } = req.query;
    
    const events = await getRoomEvents(roomId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      type,
      startDate,
      endDate,
      excludeCheckedOut: excludeCheckedOut === 'true' || excludeCheckedOut === true
    });
    
    res.status(200).json(events);
  } catch (error) {
    console.error('Error getting room events:', error);
    res.status(500).json({ message: error.message });
  }
}

// Lấy events theo hotelId
async function getEventsByHotelId(req, res) {
  try {
    const { hotelId } = req.query;
    const { limit = 10, skip = 0, types } = req.query;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'hotelId is required' });
    }

    // Parse types nếu có (có thể là string hoặc array)
    let typeArray = ['checkin', 'checkout', 'maintenance', 'transfer'];
    if (types) {
      try {
        typeArray = Array.isArray(types) ? types : JSON.parse(types);
      } catch (e) {
        // Nếu không parse được, dùng types như một string đơn
        typeArray = [types];
      }
    }

    const query = {
      hotelId: new mongoose.Types.ObjectId(hotelId),
      type: { $in: typeArray }
    };

    const events = await RoomEvent.find(query)
      .populate('roomId', 'roomNumber')
      .populate('transferredFrom', 'roomNumber')
      .populate('transferredTo', 'roomNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    res.status(200).json(events);
  } catch (error) {
    console.error('Error getting events by hotelId:', error);
    res.status(500).json({ message: error.message });
  }
}

// Tính toán tổng hợp checkout (tổng tiền phòng, tổng tiền dịch vụ, tổng cộng, còn lại phải thanh toán)
async function calculateCheckoutTotal(req, res) {
  try {
    const { roomId, checkInTime, checkOutTime, rateType, selectedServices = [], additionalCharges = 0, discount = 0, advancePayment = 0 } = req.body;
    
    if (!roomId || !checkInTime || !checkOutTime) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: roomId, checkInTime, checkOutTime' });
    }
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Tính tiền phòng từ calculateRoomPriceHelper
    let roomPriceTotal = 0;
    let finalRateType = rateType || 'hourly';
    let priceDetails = null;
    
    try {
      const priceResult = await calculateRoomPriceHelper(room, new Date(checkInTime), new Date(checkOutTime), rateType || 'hourly');
      roomPriceTotal = priceResult.totalPrice || 0;
      finalRateType = priceResult.rateType || rateType || 'hourly';
      priceDetails = priceResult.priceDetails || null;
    } catch (calcError) {
      console.error('Error calculating room price:', calcError);
      // Fallback: Tính đơn giản
      const pricing = room.pricing || {};
      const checkIn = new Date(checkInTime);
      const checkOut = new Date(checkOutTime);
      const durationMs = checkOut.getTime() - checkIn.getTime();
      const durationInHours = Math.max(1, durationMs / (1000 * 60 * 60));
      
      if (rateType === 'hourly') {
        const firstHourRate = room.firstHourRate || pricing.hourly || 0;
        const additionalHourRate = room.additionalHourRate || (firstHourRate * 0.8);
        roomPriceTotal = firstHourRate + Math.max(0, durationInHours - 1) * additionalHourRate;
      } else if (rateType === 'daily') {
        roomPriceTotal = (pricing.daily || 0) * Math.ceil(durationInHours / 24);
      } else if (rateType === 'nightly') {
        roomPriceTotal = (pricing.nightly || 0) * Math.ceil(durationInHours / 24);
      } else {
        roomPriceTotal = pricing.hourly || 0;
      }
    }
    
    // Tính tổng tiền dịch vụ
    let servicesTotal = 0;
    if (selectedServices && Array.isArray(selectedServices) && selectedServices.length > 0) {
      servicesTotal = selectedServices.reduce((sum, service) => {
        return sum + (service.totalPrice || (service.price || 0) * (service.quantity || 1));
      }, 0);
    }
    
    // Tính tổng cộng = tiền phòng + phụ thu + tiền dịch vụ (KHÔNG trừ khuyến mãi và đặt trước)
    const totalPrice = roomPriceTotal + (Number(additionalCharges) || 0) + servicesTotal;
    
    // Còn lại phải thanh toán = Tổng cộng - đặt trước - khuyến mãi (cho phép số âm)
    const remainingAmount = totalPrice - (Number(advancePayment) || 0) - (Number(discount) || 0);
    
    res.status(200).json({
      roomPriceTotal,
      servicesTotal,
      totalPrice,
      remainingAmount,
      rateType: finalRateType,
      priceDetails
    });
  } catch (error) {
    console.error('Error calculating checkout total:', error);
    res.status(500).json({ message: error.message });
  }
}

// Check-in lại (undo checkout) - chỉ dành cho superadmin, admin, business
async function recheckinRoom(req, res) {
  try {
    const { roomId, invoiceId, historyId } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ error: 'Thiếu thông tin phòng' });
    }
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Tìm checkout event cuối cùng từ RoomEvent collection
    const checkoutEvent = await RoomEvent.findOne({
      roomId: roomId,
      type: 'checkout'
    }).sort({ checkoutTime: -1 });

    if (!checkoutEvent) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin checkout' });
    }
    
    // Tìm checkin event tương ứng
    let checkinEvent = null;
    
    // Cách 1: Tìm bằng checkinTime nếu có (khớp chính xác)
    if (checkoutEvent.checkinTime) {
      checkinEvent = await RoomEvent.findOne({
        roomId: roomId,
        type: 'checkin',
        checkinTime: checkoutEvent.checkinTime
      });
    }
    
    // Cách 2: Nếu không tìm thấy, tìm checkin event gần nhất trước checkoutTime
    if (!checkinEvent) {
      const checkoutTime = checkoutEvent.checkoutTime ? new Date(checkoutEvent.checkoutTime) : new Date();
      
      // Tìm tất cả checkin events trước checkoutTime
      const checkinEvents = await RoomEvent.find({
        roomId: roomId,
        type: 'checkin',
        checkinTime: { $lte: checkoutTime }
      })
      .sort({ checkinTime: -1 })
      .limit(10)
      .lean();
      
      // Tìm checkin event chưa có checkout tương ứng
      for (const event of checkinEvents) {
        if (!event.checkinTime) continue;
        
        const eventCheckinTime = event.checkinTime instanceof Date 
          ? event.checkinTime 
          : new Date(event.checkinTime);
        
        // Kiểm tra xem có checkout event nào tương ứng với checkin này không
        const correspondingCheckout = await RoomEvent.findOne({
          roomId: roomId,
          type: 'checkout',
          checkinTime: eventCheckinTime
        });
        
        // Nếu không có checkout tương ứng, đây là checkin event cần tìm
        // Hoặc nếu checkout event này chính là checkout event đang xử lý
        if (!correspondingCheckout || correspondingCheckout._id.toString() === checkoutEvent._id.toString()) {
          checkinEvent = event;
          break;
        }
      }
    }
    
    // Cách 3: Nếu vẫn không tìm thấy, tìm checkin event cuối cùng (fallback)
    if (!checkinEvent) {
      checkinEvent = await RoomEvent.findOne({
        roomId: roomId,
        type: 'checkin'
      }).sort({ checkinTime: -1 });
    }
    
    // Nếu không tìm thấy checkin event, tạo lại từ thông tin trong checkout event
    if (!checkinEvent) {
      console.log('Checkin event not found, creating new one from checkout event data');
      
      // Lấy thông tin từ checkout event để tạo lại checkin event
      const checkinTimeFromCheckout = checkoutEvent.checkinTime 
        ? new Date(checkoutEvent.checkinTime) 
        : new Date(checkoutEvent.checkoutTime.getTime() - 3600000); // Fallback: 1 giờ trước checkout
      
      // Tạo lại checkin event từ thông tin trong checkout event
      const newCheckinEventData = {
        type: 'checkin',
        checkinTime: checkinTimeFromCheckout,
        expectedCheckoutTime: checkoutEvent.expectedCheckoutTime || null, // Khôi phục expectedCheckoutTime
        userId: checkoutEvent.userId || null,
        staffId: checkoutEvent.staffId || null,
        guestInfo: checkoutEvent.guestInfo || null,
        paymentMethod: checkoutEvent.paymentMethod || 'cash',
        rateType: checkoutEvent.rateType || 'hourly',
        advancePayment: checkoutEvent.advancePayment || 0,
        additionalCharges: checkoutEvent.additionalCharges || 0,
        discount: checkoutEvent.discount || 0,
        notes: checkoutEvent.notes || '',
        selectedServices: checkoutEvent.selectedServices || [], // Khôi phục selectedServices
        transferredFrom: checkoutEvent.transferredFrom || null,
        transferredAt: checkoutEvent.transferredAt || null,
        transferredBy: checkoutEvent.transferredBy || null,
        bookingId: checkoutEvent.bookingId || null
      };
      
      // Lưu checkin event mới
      const savedCheckinEvent = await saveRoomEvent(roomId, room.hotelId, newCheckinEventData);
      if (savedCheckinEvent) {
        checkinEvent = savedCheckinEvent;
        console.log('Created new checkin event from checkout event data:', savedCheckinEvent._id);
      } else {
        return res.status(500).json({ 
          error: 'Không thể tạo lại checkin event',
          details: {
            checkoutEventId: checkoutEvent._id,
            checkoutTime: checkoutEvent.checkoutTime,
            checkinTime: checkoutEvent.checkinTime,
            roomId: roomId
          }
        });
      }
    } else {
      // Nếu tìm thấy checkin event, đảm bảo nó có đầy đủ thông tin từ checkout event
      let needToUpdate = false;
      
      // Đảm bảo checkinTime là thời gian cũ (từ checkout event hoặc từ checkin event hiện tại)
      if (!checkinEvent.checkinTime || (checkoutEvent.checkinTime && checkinEvent.checkinTime.toString() !== checkoutEvent.checkinTime.toString())) {
        // Ưu tiên lấy từ checkout event (thời gian check-in cũ)
        if (checkoutEvent.checkinTime) {
          checkinEvent.checkinTime = new Date(checkoutEvent.checkinTime);
        } else if (!checkinEvent.checkinTime) {
          // Fallback: 1 giờ trước checkout
          checkinEvent.checkinTime = new Date(checkoutEvent.checkoutTime.getTime() - 3600000);
        }
        needToUpdate = true;
      }
      
      // Đảm bảo guestInfo có đầy đủ thông tin từ checkout event (thông tin khách cũ)
      if (checkoutEvent.guestInfo) {
        if (!checkinEvent.guestInfo) {
          checkinEvent.guestInfo = checkoutEvent.guestInfo;
          needToUpdate = true;
        } else {
          // Merge guestInfo từ checkout event để đảm bảo đầy đủ
          const mergedGuestInfo = {
            ...checkinEvent.guestInfo,
            ...checkoutEvent.guestInfo,
            // Ưu tiên giữ nguyên các field đã có trong checkin event, nhưng bổ sung từ checkout event
            name: checkinEvent.guestInfo.name || checkoutEvent.guestInfo.name || 'Khách lẻ',
            phone: checkinEvent.guestInfo.phone || checkoutEvent.guestInfo.phone || '',
            email: checkinEvent.guestInfo.email || checkoutEvent.guestInfo.email || '',
            idNumber: checkinEvent.guestInfo.idNumber || checkoutEvent.guestInfo.idNumber || '',
            address: checkinEvent.guestInfo.address || checkoutEvent.guestInfo.address || '',
            guestSource: checkinEvent.guestInfo.guestSource || checkoutEvent.guestInfo.guestSource || 'walkin'
          };
          checkinEvent.guestInfo = mergedGuestInfo;
          needToUpdate = true;
        }
      }
      
      // Đảm bảo các thông tin khác từ checkout event
      if (checkoutEvent.rateType && !checkinEvent.rateType) {
        checkinEvent.rateType = checkoutEvent.rateType;
        needToUpdate = true;
      }
      if (checkoutEvent.advancePayment !== undefined && checkinEvent.advancePayment === undefined) {
        checkinEvent.advancePayment = checkoutEvent.advancePayment;
        needToUpdate = true;
      }
      // Khôi phục selectedServices từ checkout event
      if (checkoutEvent.selectedServices && Array.isArray(checkoutEvent.selectedServices) && checkoutEvent.selectedServices.length > 0) {
        if (!checkinEvent.selectedServices || !Array.isArray(checkinEvent.selectedServices) || checkinEvent.selectedServices.length === 0) {
          checkinEvent.selectedServices = checkoutEvent.selectedServices;
          needToUpdate = true;
        }
      }
      // Khôi phục expectedCheckoutTime từ checkout event
      if (checkoutEvent.expectedCheckoutTime && !checkinEvent.expectedCheckoutTime) {
        checkinEvent.expectedCheckoutTime = checkoutEvent.expectedCheckoutTime instanceof Date 
          ? checkoutEvent.expectedCheckoutTime 
          : new Date(checkoutEvent.expectedCheckoutTime);
        needToUpdate = true;
      }
      // Khôi phục additionalCharges và discount
      if (checkoutEvent.additionalCharges !== undefined && checkinEvent.additionalCharges === undefined) {
        checkinEvent.additionalCharges = checkoutEvent.additionalCharges;
        needToUpdate = true;
      }
      if (checkoutEvent.discount !== undefined && checkinEvent.discount === undefined) {
        checkinEvent.discount = checkoutEvent.discount;
        needToUpdate = true;
      }
      // Khôi phục notes nếu có
      if (checkoutEvent.notes && !checkinEvent.notes) {
        checkinEvent.notes = checkoutEvent.notes;
        needToUpdate = true;
      }
      
      // Lưu nếu có thay đổi
      if (needToUpdate) {
        await checkinEvent.save();
        console.log('Updated checkin event with full information from checkout event');
      }
    }
    
    // Xóa checkout event
    await RoomEvent.deleteOne({ _id: checkoutEvent._id });
    
    // Xóa invoice nếu có
    if (checkoutEvent.invoiceId || invoiceId) {
      const invoiceIdToDelete = checkoutEvent.invoiceId || invoiceId;
      try {
        await Invoice.deleteOne({ _id: invoiceIdToDelete });
        console.log('Deleted invoice:', invoiceIdToDelete);
      } catch (invoiceError) {
        console.error('Error deleting invoice:', invoiceError);
        // Không throw error, tiếp tục
      }
    }
    
    // Xóa bookingHistory entry nếu có
    if (historyId) {
      const historyIndex = room.bookingHistory.findIndex(
        h => h._id.toString() === historyId.toString()
      );
      if (historyIndex !== -1) {
        room.bookingHistory.splice(historyIndex, 1);
      }
    } else {
      // Tìm và xóa bookingHistory entry cuối cùng có event = 'check-out'
      const checkoutHistoryIndex = room.bookingHistory.findIndex(
        h => h.event === 'check-out' && h.checkOutTime
      );
      if (checkoutHistoryIndex !== -1) {
        const checkoutHistory = room.bookingHistory[checkoutHistoryIndex];
        // Xóa invoiceId nếu có
        if (checkoutHistory.invoiceId) {
          try {
            await Invoice.deleteOne({ _id: checkoutHistory.invoiceId });
          } catch (invoiceError) {
            console.error('Error deleting invoice from history:', invoiceError);
          }
        }
        room.bookingHistory.splice(checkoutHistoryIndex, 1);
      }
    }
    
    // Cập nhật room status về occupied
    room.status = 'occupied';
    room.guestStatus = 'in';
    
    // Khôi phục currentBooking nếu có
    if (checkinEvent.bookingId) {
      const booking = await Booking.findById(checkinEvent.bookingId);
      if (booking) {
        booking.status = 'checked_in';
        booking.checkOutDate = undefined;
        booking.actualCheckOutDate = undefined;
        booking.paymentStatus = 'pending';
        await booking.save({ validateBeforeSave: false });
        room.currentBooking = booking._id;
      }
    }
    
    // Cập nhật doanh thu phòng (trừ đi số tiền đã checkout)
    if (checkoutEvent.payment && room.revenue && room.revenue.total) {
      room.revenue.total = Math.max(0, room.revenue.total - checkoutEvent.payment);
      // Xóa entry trong revenue history nếu có
      if (room.revenue.history && room.revenue.history.length > 0) {
        room.revenue.history = room.revenue.history.filter(
          h => h.invoiceId?.toString() !== (checkoutEvent.invoiceId || invoiceId)?.toString()
        );
      }
    }
    
    // Cập nhật doanh thu khách sạn
    if (checkoutEvent.payment) {
      try {
        const hotel = await Hotel.findById(room.hotelId);
        if (hotel && hotel.revenue) {
          hotel.revenue.daily = Math.max(0, (hotel.revenue.daily || 0) - checkoutEvent.payment);
          hotel.revenue.total = Math.max(0, (hotel.revenue.total || 0) - checkoutEvent.payment);
          // Xóa entry trong revenue history nếu có
          if (hotel.revenue.history && hotel.revenue.history.length > 0) {
            hotel.revenue.history = hotel.revenue.history.filter(
              h => h.invoiceId?.toString() !== (checkoutEvent.invoiceId || invoiceId)?.toString()
            );
          }
          await hotel.save();
        }
      } catch (hotelError) {
        console.error('Error updating hotel revenue:', hotelError);
        // Không throw error
      }
    }
    
    await room.save();
    
    // Trả về checkin event với đầy đủ thông tin để frontend có thể sử dụng
    // Đảm bảo checkinEvent là plain object với đầy đủ thông tin
    const checkinEventResponse = checkinEvent.toObject ? checkinEvent.toObject() : checkinEvent;
    
    // Đảm bảo có đầy đủ thông tin từ checkout event (nếu thiếu)
    if (!checkinEventResponse.checkinTime && checkoutEvent.checkinTime) {
      checkinEventResponse.checkinTime = checkoutEvent.checkinTime;
    }
    if (!checkinEventResponse.guestInfo && checkoutEvent.guestInfo) {
      checkinEventResponse.guestInfo = checkoutEvent.guestInfo;
    }
    if (!checkinEventResponse.expectedCheckoutTime && checkoutEvent.expectedCheckoutTime) {
      checkinEventResponse.expectedCheckoutTime = checkoutEvent.expectedCheckoutTime;
    }
    if ((!checkinEventResponse.selectedServices || checkinEventResponse.selectedServices.length === 0) && 
        checkoutEvent.selectedServices && checkoutEvent.selectedServices.length > 0) {
      checkinEventResponse.selectedServices = checkoutEvent.selectedServices;
    }
    if (checkinEventResponse.advancePayment === undefined && checkoutEvent.advancePayment !== undefined) {
      checkinEventResponse.advancePayment = checkoutEvent.advancePayment;
    }
    if (checkinEventResponse.additionalCharges === undefined && checkoutEvent.additionalCharges !== undefined) {
      checkinEventResponse.additionalCharges = checkoutEvent.additionalCharges;
    }
    if (checkinEventResponse.discount === undefined && checkoutEvent.discount !== undefined) {
      checkinEventResponse.discount = checkoutEvent.discount;
    }
    if (!checkinEventResponse.rateType && checkoutEvent.rateType) {
      checkinEventResponse.rateType = checkoutEvent.rateType;
    }
    
    res.status(200).json({
      message: 'Check-in lại thành công',
      room,
      checkinEvent: checkinEventResponse
    });
  } catch (error) {
    console.error('Error rechecking in room:', error);
    res.status(500).json({ error: 'Lỗi khi check-in lại: ' + error.message });
  }
}

// Xóa lịch sử checkout (chỉ superadmin)
async function deleteCheckoutHistory(req, res) {
  try {
    const { roomId, invoiceId, historyId } = req.body;
    
    if (!roomId || !historyId) {
      return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
    }
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    // Tìm và xóa bookingHistory entry
    const historyIndex = room.bookingHistory.findIndex(
      h => h._id.toString() === historyId.toString()
    );
    
    if (historyIndex === -1) {
      return res.status(404).json({ error: 'Không tìm thấy lịch sử' });
    }
    
    const historyEntry = room.bookingHistory[historyIndex];
    
    // Xóa invoice nếu có
    if (historyEntry.invoiceId || invoiceId) {
      const invoiceIdToDelete = historyEntry.invoiceId || invoiceId;
      try {
        await Invoice.deleteOne({ _id: invoiceIdToDelete });
        console.log('Deleted invoice:', invoiceIdToDelete);
      } catch (invoiceError) {
        console.error('Error deleting invoice:', invoiceError);
      }
    }
    
    // Xóa checkout event từ RoomEvent nếu có
    if (historyEntry.checkOutTime) {
      try {
        await RoomEvent.deleteMany({
          roomId: roomId,
          type: 'checkout',
          checkoutTime: historyEntry.checkOutTime
        });
      } catch (eventError) {
        console.error('Error deleting checkout event:', eventError);
      }
    }
    
    // Cập nhật doanh thu phòng
    if (historyEntry.totalAmount && room.revenue && room.revenue.total) {
      room.revenue.total = Math.max(0, room.revenue.total - historyEntry.totalAmount);
      // Xóa entry trong revenue history
      if (room.revenue.history && room.revenue.history.length > 0) {
        room.revenue.history = room.revenue.history.filter(
          h => h.invoiceId?.toString() !== (historyEntry.invoiceId || invoiceId)?.toString()
        );
      }
    }
    
    // Cập nhật doanh thu khách sạn
    if (historyEntry.totalAmount) {
      try {
        const hotel = await Hotel.findById(room.hotelId);
        if (hotel && hotel.revenue) {
          hotel.revenue.daily = Math.max(0, (hotel.revenue.daily || 0) - historyEntry.totalAmount);
          hotel.revenue.total = Math.max(0, (hotel.revenue.total || 0) - historyEntry.totalAmount);
          // Xóa entry trong revenue history
          if (hotel.revenue.history && hotel.revenue.history.length > 0) {
            hotel.revenue.history = hotel.revenue.history.filter(
              h => h.invoiceId?.toString() !== (historyEntry.invoiceId || invoiceId)?.toString()
            );
          }
          await hotel.save();
        }
      } catch (hotelError) {
        console.error('Error updating hotel revenue:', hotelError);
      }
    }
    
    // Xóa bookingHistory entry
    room.bookingHistory.splice(historyIndex, 1);
    await room.save();
    
    res.status(200).json({
      message: 'Xóa lịch sử thành công'
    });
  } catch (error) {
    console.error('Error deleting checkout history:', error);
    res.status(500).json({ error: 'Lỗi khi xóa lịch sử: ' + error.message });
  }
}

module.exports = {
  getallRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoomBookings,
  checkinRoom,
  checkoutRoom,
  cleanRoom,
  assignServiceToRoom,
  removeServiceFromRoom,
  getAvailableRooms,
  getRoomsByFloor,
  getHotelFloors,
  getRoomHistory,
  getInvoiceDetails,
  updateRoomStatus,
  transferRoom,
  createRoomBooking,
  cancelRoomBooking,
  getRoomBookings,
  guestOut,
  guestReturn,
  updateRoomCheckinInfo,
  getRoomEventsById,
  getEventsByHotelId,
  recheckinRoom,
  deleteCheckoutHistory,
  calculateCheckoutTotal
};
