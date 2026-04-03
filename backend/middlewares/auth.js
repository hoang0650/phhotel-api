const jwt = require('jsonwebtoken');
const { User } = require('../models/users');
const { Hotel } = require('../models/hotel');
const { Business } = require('../models/business');
const { Staff } = require('../models/staff');
const dotenv = require('dotenv');
dotenv.config();

/**
 * Middleware xác thực token JWT
 * Kiểm tra và xác thực token trong header Authorization
 * Nếu token hợp lệ, thêm thông tin người dùng vào req.user
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Không tìm thấy token xác thực' });
    }

    const token = authHeader.split(' ')[1];
    
    // Xác thực token
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ 
          message: err.name === 'TokenExpiredError' 
            ? 'Token đã hết hạn' 
            : 'Token không hợp lệ' 
        });
      }
      
      // Kiểm tra người dùng có tồn tại và đang hoạt động
      // Đảm bảo load đầy đủ businessId và hotelId
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'Người dùng không tồn tại' });
      }
      
      if (user.status !== 'active') {
        return res.status(403).json({ message: 'Tài khoản đã bị khóa hoặc vô hiệu hóa' });
      }

      // Kiểm tra blocking cascade
      const blockCheck = await checkBlockingCascade(user);
      if (blockCheck.blocked) {
        return res.status(403).json({ 
          message: blockCheck.message,
          blockedBy: blockCheck.blockedBy
        });
      }
      
      // Nếu là staff, lấy hotelId từ Staff model
      if (user.role === 'staff' && !user.hotelId) {
        const staff = await Staff.findOne({ userId: user._id });
        if (staff && staff.hotelId) {
          user.hotelId = staff.hotelId;
        }
      }
      
      // Đảm bảo businessId được load đúng (có thể là ObjectId hoặc null)
      // Log để debug nếu là business user
      if (user.role === 'business') {
        console.log('Business user authenticated:', {
          userId: user._id,
          username: user.username,
          businessId: user.businessId,
          businessIdType: typeof user.businessId,
          businessIdConstructor: user.businessId?.constructor?.name,
          businessIdString: user.businessId?.toString()
        });
      }
      
      // Gán thông tin người dùng vào request
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Lỗi xác thực', error: error.message });
  }
};

/**
 * Kiểm tra blocking cascade
 * - Admin không thể bị block
 * - Business bị block -> tất cả hotel, staff, user thuộc business đó bị block
 * - Hotel bị block -> tất cả staff thuộc hotel đó bị block
 */
const checkBlockingCascade = async (user) => {
  // Admin không thể bị block
  if (user.role === 'superadmin' || user.role === 'admin') {
    return { blocked: false };
  }

  // Kiểm tra business của user
  if (user.businessId) {
    const business = await Business.findById(user.businessId);
    if (business && business.status === 'suspended') {
      return { 
        blocked: true, 
        message: 'Doanh nghiệp của bạn đã bị đình chỉ. Vui lòng liên hệ quản trị viên.',
        blockedBy: 'business'
      };
    }
    if (business && business.status === 'inactive') {
      return { 
        blocked: true, 
        message: 'Doanh nghiệp của bạn chưa được kích hoạt.',
        blockedBy: 'business'
      };
    }
  }

  // Kiểm tra hotel của user
  if (user.hotelId) {
    const hotel = await Hotel.findById(user.hotelId);
    if (hotel) {
      // Kiểm tra hotel có bị block không
      if (hotel.status === 'inactive' || hotel.status === 'maintenance') {
        return { 
          blocked: true, 
          message: `Khách sạn của bạn đang ở trạng thái ${hotel.status === 'inactive' ? 'không hoạt động' : 'bảo trì'}.`,
          blockedBy: 'hotel'
        };
      }

      // Kiểm tra business của hotel có bị block không
      const hotelBusiness = await Business.findById(hotel.businessId);
      if (hotelBusiness && (hotelBusiness.status === 'suspended' || hotelBusiness.status === 'inactive')) {
        return { 
          blocked: true, 
          message: 'Doanh nghiệp sở hữu khách sạn của bạn đã bị đình chỉ.',
          blockedBy: 'business'
        };
      }
    }
  }

  // Kiểm tra staff
  if (user.role === 'staff') {
    const staff = await Staff.findOne({ userId: user._id });
    if (staff) {
      if (staff.employmentInfo?.status === 'terminated') {
        return { 
          blocked: true, 
          message: 'Tài khoản nhân viên của bạn đã bị chấm dứt.',
          blockedBy: 'staff'
        };
      }

      // Kiểm tra hotel của staff
      const staffHotel = await Hotel.findById(staff.hotelId);
      if (staffHotel && staffHotel.status !== 'active') {
        return { 
          blocked: true, 
          message: 'Khách sạn nơi bạn làm việc đang không hoạt động.',
          blockedBy: 'hotel'
        };
      }
    }
  }

  return { blocked: false };
};

/**
 * Middleware phân quyền theo vai trò
 * Phân quyền chi tiết:
 * - superadmin/admin: Full quyền (quản lý tất cả business, hotel, room, staff, user)
 * - business: CHỈ XEM business, hotel, room thuộc sở hữu của business đó (KHÔNG thể tạo/cập nhật/xóa)
 * - hotel (manager): Chỉ quản lý room và staff thuộc hotel đó (KHÔNG thể tạo/cập nhật hotel)
 * - staff: Chỉ xem và thao tác với room, không được phép hỏi về business/hotel/staff khác
 * 
 * @param {Array} allowedRoles - Mảng các vai trò được phép truy cập
 * @returns {Function} - Middleware kiểm tra quyền truy cập
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Không có thông tin người dùng' });
    }

    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: 'Bạn không có quyền thực hiện thao tác này' 
      });
    }
    
    next();
  };
};

/**
 * Middleware kiểm tra quyền truy cập dựa trên doanh nghiệp
 * Đảm bảo người dùng chỉ có thể truy cập dữ liệu của doanh nghiệp mình
 */
const authorizeBusinessAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      // Admin có quyền truy cập tất cả
      return next();
    }

    // Lấy businessId từ params (có thể là :id hoặc :businessId)
    const businessId = req.params.id || req.params.businessId || req.body.businessId || req.query.businessId;
    
    if (!businessId) {
      return res.status(400).json({ message: 'Thiếu thông tin doanh nghiệp' });
    }
    
    // Business chỉ được truy cập business của mình
    if (req.user.role === 'business') {
      if (req.user.businessId && req.user.businessId.toString() !== businessId.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập dữ liệu của doanh nghiệp khác' });
      }
    }
    
    // Hotel và các role khác không được phép truy cập business management
    if (req.user.role === 'hotel' || req.user.role === 'staff') {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập quản lý doanh nghiệp' });
    }
    
    next();
  } catch (error) {
    console.error('Business access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập', error: error.message });
  }
};

/**
 * Middleware kiểm tra quyền truy cập dựa trên khách sạn
 * Đảm bảo người dùng chỉ có thể truy cập dữ liệu của khách sạn mình
 */
const authorizeHotelAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      // Admin có quyền truy cập tất cả
      return next();
    }

    const hotelId = req.params.hotelId || req.body.hotelId || req.query.hotelId;
    
    if (!hotelId) {
      // Nếu không có hotelId, cho phép tiếp tục (sẽ filter ở controller)
      return next();
    }
    
    // Business có thể truy cập mọi khách sạn thuộc doanh nghiệp mình
    if (req.user.role === 'business') {
      const hotel = await Hotel.findById(hotelId).select('businessId');
      if (!hotel) {
        return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
      }
      
      if (hotel.businessId.toString() !== req.user.businessId.toString()) {
        return res.status(403).json({ message: 'Khách sạn không thuộc doanh nghiệp của bạn' });
      }
      
      return next();
    }
    
    // Người dùng khác chỉ có thể truy cập khách sạn của mình
    if (req.user.hotelId && req.user.hotelId.toString() !== hotelId) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập dữ liệu của khách sạn khác' });
    }
    
    next();
  } catch (error) {
    console.error('Hotel access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập', error: error.message });
  }
};

/**
 * Middleware kiểm tra quyền truy cập staff
 * - Admin: Full quyền quản lý tất cả staff
 * - Business: Chỉ quản lý staff thuộc hotels của business
 * - Hotel Manager: Chỉ quản lý staff thuộc hotel của mình
 * - Staff: Không được quản lý staff khác
 */
const authorizeStaffAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      return next();
    }

    const staffId = req.params.staffId || req.params.id || req.body.staffId;
    
    if (!staffId) {
      return next();
    }

    const targetStaff = await Staff.findById(staffId).populate('hotelId');
    if (!targetStaff) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    // Business có thể quản lý staff thuộc hotels của mình
    if (req.user.role === 'business') {
      const hotel = targetStaff.hotelId;
      if (hotel && hotel.businessId.toString() !== req.user.businessId.toString()) {
        return res.status(403).json({ 
          message: 'Nhân viên này không thuộc doanh nghiệp của bạn' 
        });
      }
      return next();
    }

    // Hotel manager chỉ quản lý staff thuộc hotel của mình
    if (req.user.role === 'hotel') {
      if (targetStaff.hotelId._id.toString() !== req.user.hotelId.toString()) {
        return res.status(403).json({ 
          message: 'Bạn chỉ có thể quản lý nhân viên thuộc khách sạn của mình' 
        });
      }
      return next();
    }

    // Staff không được quản lý staff khác
    if (req.user.role === 'staff') {
      return res.status(403).json({ 
        message: 'Bạn không có quyền quản lý nhân viên khác' 
      });
    }

    next();
  } catch (error) {
    console.error('Staff access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập', error: error.message });
  }
};

/**
 * Middleware kiểm tra quyền truy cập room
 * - Admin: Full quyền
 * - Business: Quản lý rooms thuộc hotels của business
 * - Hotel Manager: Quản lý rooms thuộc hotel
 * - Staff: Chỉ xem và thao tác cơ bản với rooms
 */
const authorizeRoomAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin' || req.user.role === 'admin') {
      return next();
    }

    const { Room } = require('../models/rooms');
    const roomId = req.params.roomId || req.params.id || req.body.roomId;
    
    if (!roomId) {
      return next();
    }

    const room = await Room.findById(roomId).populate('hotelId');
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }

    // Business kiểm tra hotel thuộc business
    if (req.user.role === 'business') {
      if (room.hotelId.businessId.toString() !== req.user.businessId.toString()) {
        return res.status(403).json({ 
          message: 'Phòng này không thuộc doanh nghiệp của bạn' 
        });
      }
      return next();
    }

    // Hotel/Staff kiểm tra phòng thuộc hotel
    if (req.user.hotelId) {
      if (room.hotelId._id.toString() !== req.user.hotelId.toString()) {
        return res.status(403).json({ 
          message: 'Phòng này không thuộc khách sạn của bạn' 
        });
      }
    }

    next();
  } catch (error) {
    console.error('Room access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập', error: error.message });
  }
};

/**
 * Middleware kiểm tra quyền cho AI
 * Thiết kế cho AI Check theo role:
 * - Cấp cao nhất có thể trả lời toàn bộ hệ thống thuộc role đó
 * - VD: business hỏi AI về thông tin staff thuộc business -> được phép
 * - Staff không được phép hỏi về business/hotel/staff khác nhưng được phép hỏi về room
 */
const authorizeAIAccess = async (req, res, next) => {
  try {
    const { queryType, targetId, targetType } = req.body;

    // Xác định quyền truy cập dựa trên role
    const accessRules = {
      'superadmin': ['all'],
      'admin': ['all'],
      'business': ['hotel', 'room', 'staff', 'booking', 'service', 'report'],
      'hotel': ['room', 'staff', 'booking', 'service', 'report'],
      'staff': ['room', 'booking', 'service'] // Staff chỉ được hỏi về room
    };

    const userRole = req.user.role;
    const allowedTargets = accessRules[userRole] || [];

    // Kiểm tra xem user có quyền query target type không
    if (!allowedTargets.includes('all') && !allowedTargets.includes(targetType)) {
      return res.status(403).json({ 
        message: `Với vai trò ${userRole}, bạn không được phép truy vấn thông tin về ${targetType}`,
        allowedTypes: allowedTargets
      });
    }

    // Kiểm tra scope của query
    if (targetId && targetType) {
      // Staff không được hỏi về staff/hotel/business khác
      if (userRole === 'staff') {
        if (['staff', 'hotel', 'business'].includes(targetType)) {
          return res.status(403).json({ 
            message: 'Với vai trò nhân viên, bạn không được phép truy vấn thông tin về nhân viên, khách sạn hoặc doanh nghiệp khác' 
          });
        }
      }

      // Business chỉ được query trong phạm vi business của mình
      if (userRole === 'business' && targetType === 'staff') {
        const staff = await Staff.findById(targetId).populate({
          path: 'hotelId',
          select: 'businessId'
        });
        
        if (staff && staff.hotelId.businessId.toString() !== req.user.businessId.toString()) {
          return res.status(403).json({ 
            message: 'Nhân viên này không thuộc doanh nghiệp của bạn' 
          });
        }
      }

      // Hotel manager chỉ được query staff trong hotel của mình
      if (userRole === 'hotel' && targetType === 'staff') {
        const staff = await Staff.findById(targetId);
        if (staff && staff.hotelId.toString() !== req.user.hotelId.toString()) {
          return res.status(403).json({ 
            message: 'Nhân viên này không thuộc khách sạn của bạn' 
          });
        }
      }
    }

    // Gán thông tin scope vào request để AI sử dụng
    req.aiScope = {
      role: userRole,
      allowedTargets,
      businessId: req.user.businessId,
      hotelId: req.user.hotelId
    };

    next();
  } catch (error) {
    console.error('AI access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập AI', error: error.message });
  }
};

/**
 * Middleware kiểm tra quyền xem lịch sử giao ca
 * Admin, business và hotel được phép xem
 */
const authorizeShiftHistoryAccess = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    
    if (!['superadmin', 'admin', 'business', 'hotel'].includes(userRole)) {
      return res.status(403).json({ 
        message: 'Bạn không có quyền xem lịch sử giao ca' 
      });
    }

    // Nếu là business, chỉ được xem lịch sử của hotels thuộc business đó
    if (userRole === 'business') {
      const hotelId = req.params.hotelId || req.query.hotelId;
      if (hotelId) {
        const hotel = await Hotel.findById(hotelId);
        if (!hotel || hotel.businessId.toString() !== req.user.businessId.toString()) {
          return res.status(403).json({ 
            message: 'Bạn chỉ được xem lịch sử giao ca của khách sạn thuộc doanh nghiệp của mình' 
          });
        }
      } else {
        // Gán businessId để filter ở controller
        req.filterByBusinessId = req.user.businessId;
      }
    }

    // Nếu là hotel, chỉ được xem lịch sử của hotel của mình
    if (userRole === 'hotel') {
      const hotelId = req.params.hotelId || req.query.hotelId;
      if (hotelId && hotelId !== req.user.hotelId?.toString()) {
        return res.status(403).json({ 
          message: 'Bạn chỉ được xem lịch sử giao ca của khách sạn của mình' 
        });
      } else {
        // Gán hotelId để filter ở controller
        req.filterByHotelId = req.user.hotelId;
      }
    }

    next();
  } catch (error) {
    console.error('Shift history access error:', error);
    res.status(500).json({ message: 'Lỗi kiểm tra quyền truy cập', error: error.message });
  }
};

/**
 * Helper function để lấy danh sách hotels của một business
 */
const getHotelsByBusiness = async (businessId) => {
  return await Hotel.find({ businessId }).select('_id');
};

/**
 * Helper function để kiểm tra user có quyền với resource không
 */
const checkResourcePermission = async (user, resourceType, resourceId) => {
  const permissions = {
    superadmin: true,
    admin: true
  };

  if (permissions[user.role]) {
    return { allowed: true };
  }

  switch (resourceType) {
    case 'business':
      if (user.role === 'business' && user.businessId?.toString() === resourceId) {
        return { allowed: true };
      }
      break;
    
    case 'hotel':
      if (user.role === 'business') {
        const hotel = await Hotel.findById(resourceId);
        if (hotel && hotel.businessId.toString() === user.businessId.toString()) {
          return { allowed: true };
        }
      }
      if (['hotel', 'staff'].includes(user.role) && user.hotelId?.toString() === resourceId) {
        return { allowed: true };
      }
      break;

    case 'staff':
      const staff = await Staff.findById(resourceId).populate('hotelId');
      if (user.role === 'business' && staff?.hotelId?.businessId?.toString() === user.businessId?.toString()) {
        return { allowed: true };
      }
      if (user.role === 'hotel' && staff?.hotelId?._id?.toString() === user.hotelId?.toString()) {
        return { allowed: true };
      }
      break;

    case 'room':
      const { Room } = require('../models/rooms');
      const room = await Room.findById(resourceId).populate('hotelId');
      if (user.role === 'business' && room?.hotelId?.businessId?.toString() === user.businessId?.toString()) {
        return { allowed: true };
      }
      if (['hotel', 'staff'].includes(user.role) && room?.hotelId?._id?.toString() === user.hotelId?.toString()) {
        return { allowed: true };
      }
      break;
  }

  return { 
    allowed: false, 
    message: `Bạn không có quyền truy cập ${resourceType} này` 
  };
};

/**
 * Middleware kiểm tra chế độ bảo trì
 * Chỉ superadmin và admin mới có thể truy cập khi maintenance mode được bật
 * Các user khác sẽ nhận thông báo bảo trì
 * 
 * Lưu ý: Middleware này nên được đặt SAU authenticateToken để có req.user
 * Nếu chưa có req.user, sẽ tự decode token để kiểm tra role
 */
const checkMaintenanceMode = async (req, res, next) => {
  try {
    const { Settings } = require('../models/settings');
    const jwt = require('jsonwebtoken');
    const { User } = require('../models/users');
    
    // Lấy settings để kiểm tra maintenance mode
    let settings = await Settings.findOne();
    
    // Nếu chưa có settings hoặc maintenance mode tắt, cho phép tiếp tục
    if (!settings || !settings.generalSettings?.maintenanceMode) {
      return next();
    }
    
    // Các route không cần authentication (login, signup, forgot-password, reset-password) được bỏ qua
    // /api/settings/announcements cũng được bỏ qua để user có thể xem thông báo
    const publicRoutes = [
      '/users/login',
      '/users/signup',
      '/users/forgot-password',
      '/users/reset-password',
      '/api/settings/announcements'
    ];
    
    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    
    if (isPublicRoute) {
      // Route public luôn được phép, không cần kiểm tra maintenance mode
      return next();
    }
    
    let userRole = null;
    
    // Nếu đã có req.user từ authenticateToken, lấy role từ đó
    if (req.user) {
      if (typeof req.user === 'object' && req.user !== null) {
        if (req.user.toObject && typeof req.user.toObject === 'function') {
          userRole = req.user.toObject().role;
        } else {
          userRole = req.user.role;
        }
      }
    } else {
      // Nếu chưa có req.user, thử decode token từ header để kiểm tra role
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          // Lấy user từ database để có role chính xác
          const user = await User.findById(decoded.userId).select('role');
          if (user) {
            userRole = user.role;
          } else if (decoded.role) {
            // Fallback: lấy role từ token nếu không query được database
            userRole = decoded.role;
          }
        } catch (err) {
          // Token không hợp lệ hoặc hết hạn, sẽ xử lý ở authenticateToken
          // Ở đây chỉ cần biết là không có user
        }
      }
    }
    
    // Nếu không có user hoặc không phải admin/superadmin, trả về maintenance message
    if (!userRole || (userRole !== 'superadmin' && userRole !== 'admin')) {
      return res.status(503).json({
        maintenance: true,
        message: settings.generalSettings.maintenanceMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
        maintenanceMessage: settings.generalSettings.maintenanceMessage || 'Hệ thống đang bảo trì. Vui lòng quay lại sau.'
      });
    }
    
    // Admin và superadmin có thể tiếp tục
    next();
  } catch (error) {
    console.error('Maintenance mode check error:', error);
    // Nếu có lỗi, cho phép tiếp tục để không block hệ thống
    next();
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeBusinessAccess,
  authorizeHotelAccess,
  authorizeStaffAccess,
  authorizeRoomAccess,
  authorizeAIAccess,
  authorizeShiftHistoryAccess,
  checkBlockingCascade,
  checkResourcePermission,
  getHotelsByBusiness,
  checkMaintenanceMode
};
