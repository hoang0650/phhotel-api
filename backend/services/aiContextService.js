const { Hotel } = require('../models/hotel');
const { Business } = require('../models/business');
const { Room } = require('../models/rooms');
const { Booking } = require('../models/booking');
const { Service } = require('../models/service');
const { Staff } = require('../models/staff');
const revenueService = require('./revenueService');
const mongoose = require('mongoose');

/**
 * Service để lấy context dữ liệu dựa trên quyền của user
 * Đảm bảo user chỉ có thể truy vấn dữ liệu trong phạm vi của họ
 */
class AiContextService {
  /**
   * Lấy context dữ liệu dựa trên role và hotelId/businessId của user
   * @param {Object} user - User object từ req.user
   * @returns {Object} Context object chứa thông tin phạm vi dữ liệu được phép truy vấn
   */
  async getUserContext(user) {
    const context = {
      role: user.role,
      userId: user._id,
      hotelId: null,
      businessId: null,
      allowedHotels: [],
      allowedBusinesses: [],
      dataScope: 'none',
      summary: ''
    };

    try {
      // Superadmin và Admin có quyền truy cập tất cả
      if (user.role === 'superadmin' || user.role === 'admin') {
        context.dataScope = 'all';
        context.summary = 'Bạn có quyền truy cập tất cả dữ liệu trong hệ thống.';
        return context;
      }

      // Business: chỉ truy cập dữ liệu của business mình
      if (user.role === 'business') {
        context.businessId = user.businessId || user._id;
        context.dataScope = 'business';
        
        // Lấy tất cả hotels thuộc business
        const hotels = await Hotel.find({ businessId: context.businessId }).select('_id name');
        context.allowedHotels = hotels.map(h => h._id);
        context.allowedBusinesses = [context.businessId];
        
        const business = await Business.findById(context.businessId).select('name');
        context.summary = `Bạn là chủ doanh nghiệp "${business?.name || 'N/A'}". Bạn chỉ có thể truy vấn thông tin về các khách sạn, phòng, đặt phòng, dịch vụ và nhân viên thuộc doanh nghiệp của mình.`;
        return context;
      }

      // Hotel Manager: chỉ truy cập dữ liệu của hotel mình
      if (user.role === 'hotel') {
        context.hotelId = user.hotelId;
        context.dataScope = 'hotel';
        
        if (context.hotelId) {
          const hotel = await Hotel.findById(context.hotelId).select('_id name businessId');
          if (hotel) {
            context.businessId = hotel.businessId;
            context.allowedHotels = [context.hotelId];
            context.allowedBusinesses = [hotel.businessId];
            context.summary = `Bạn là quản lý khách sạn "${hotel.name}". Bạn chỉ có thể truy vấn thông tin về phòng, đặt phòng, dịch vụ và nhân viên của khách sạn này.`;
          }
        }
        return context;
      }

      // Staff: chỉ truy cập dữ liệu của hotel mà staff thuộc về
      if (user.role === 'staff') {
        context.hotelId = user.hotelId;
        context.dataScope = 'hotel';
        
        if (context.hotelId) {
          // Nếu user.hotelId chưa có, tìm từ Staff model
          if (!context.hotelId) {
            const staff = await Staff.findOne({ userId: user._id }).select('hotelId');
            if (staff && staff.hotelId) {
              context.hotelId = staff.hotelId;
            }
          }
          
          if (context.hotelId) {
            const hotel = await Hotel.findById(context.hotelId).select('_id name businessId');
            if (hotel) {
              context.businessId = hotel.businessId;
              context.allowedHotels = [context.hotelId];
              context.allowedBusinesses = [hotel.businessId];
              context.summary = `Bạn là nhân viên của khách sạn "${hotel.name}". Bạn chỉ có thể truy vấn thông tin về phòng, đặt phòng và dịch vụ của khách sạn này.`;
            }
          }
        }
        return context;
      }

      return context;
    } catch (error) {
      console.error('Error getting user context:', error);
      return context;
    }
  }

  /**
   * Lấy dữ liệu context để trả lời câu hỏi của user
   * @param {Object} context - Context từ getUserContext
   * @param {String} query - Câu hỏi của user
   * @returns {Object} Dữ liệu context để AI sử dụng
   */
  async getDataContext(context, query) {
    const dataContext = {
      hotels: [],
      rooms: [],
      bookings: [],
      services: [],
      staff: [],
      revenue: [],
      summary: context.summary
    };

    try {
      // Superadmin và Admin: có thể truy vấn tất cả (nhưng để trống để tránh quá tải)
      if (context.dataScope === 'all') {
        // Không load tất cả dữ liệu, chỉ trả về summary
        return dataContext;
      }
      
      const queryLower = query.toLowerCase();
      const isFinancialQuery = ['doanh thu', 'lợi nhuận', 'thu chi', 'tài chính', 'revenue', 'profit', 'finance', 'tiền'].some(k => queryLower.includes(k));

      // Business scope: lấy dữ liệu của tất cả hotels thuộc business
      if (context.dataScope === 'business' && context.allowedHotels.length > 0) {
        dataContext.hotels = await Hotel.find({ 
          _id: { $in: context.allowedHotels } 
        }).select('name address contactInfo status').limit(10);
        
        dataContext.rooms = await Room.find({ 
          hotelId: { $in: context.allowedHotels } 
        }).select('roomNumber type status price').limit(20);
        
        dataContext.bookings = await Booking.find({ 
          hotelId: { $in: context.allowedHotels } 
        }).select('guestName checkIn checkOut status totalAmount').sort({ createdAt: -1 }).limit(20);
        
        dataContext.services = await Service.find({ 
          hotelId: { $in: context.allowedHotels } 
        }).select('name price category isActive').limit(20);
        
        dataContext.staff = await Staff.find({ 
          hotelId: { $in: context.allowedHotels } 
        }).populate('userId', 'username email').select('userId position').limit(20);
      }

      // Hotel scope: chỉ lấy dữ liệu của hotel đó
      if (context.dataScope === 'hotel' && context.hotelId) {
        dataContext.hotels = await Hotel.find({ 
          _id: context.hotelId 
        }).select('name address contactInfo status').limit(1);
        
        dataContext.rooms = await Room.find({ 
          hotelId: context.hotelId 
        }).select('roomNumber type status price').limit(50);
        
        dataContext.bookings = await Booking.find({ 
          hotelId: context.hotelId 
        }).select('guestName checkIn checkOut status totalAmount').sort({ createdAt: -1 }).limit(50);
        
        dataContext.services = await Service.find({ 
          hotelId: context.hotelId 
        }).select('name price category isActive').limit(50);
        
        dataContext.staff = await Staff.find({ 
          hotelId: context.hotelId 
        }).populate('userId', 'username email').select('userId position').limit(50);
      }
      
      // === FETCH REVENUE DATA IF REQUESTED ===
      if (isFinancialQuery && context.allowedHotels.length > 0) {
          // Mặc định lấy tháng này
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          
          for (const hotelId of context.allowedHotels) {
              const revenueData = await this.getRevenueData(hotelId, startOfMonth, endOfMonth);
              if (revenueData) {
                  let hotelName = 'Unknown Hotel';
                  const loadedHotel = dataContext.hotels.find(h => h._id.toString() === hotelId.toString());
                  if (loadedHotel) {
                      hotelName = loadedHotel.name;
                  } else {
                      const h = await Hotel.findById(hotelId).select('name');
                      if (h) hotelName = h.name;
                  }
                  
                  revenueData.hotelName = hotelName;
                  dataContext.revenue.push(revenueData);
              }
          }
      }

      return dataContext;
    } catch (error) {
      console.error('Error getting data context:', error);
      return dataContext;
    }
  }

  /**
   * Lấy dữ liệu doanh thu của khách sạn trong khoảng thời gian
   * @param {String} hotelId - ID khách sạn
   * @param {Date} startDate - Ngày bắt đầu
   * @param {Date} endDate - Ngày kết thúc
   */
  async getRevenueData(hotelId, startDate, endDate) {
    try {
        const result = await revenueService.calculateRevenue(hotelId, startDate, endDate);
        // Map profitAfterTax to profit for prompt consistency
        return {
            ...result,
            profit: result.profitAfterTax
        };
    } catch (error) {
        console.error(`Error calculating revenue for hotel ${hotelId}:`, error);
        return null;
    }
  }

  /**
   * Tạo prompt context cho AI dựa trên user context và data context
   * @param {Object} userContext - Context từ getUserContext
   * @param {Object} dataContext - Context từ getDataContext
   * @param {String} userQuery - Câu hỏi của user
   * @returns {String} Prompt context để gửi cho AI
   */
  buildPromptContext(userContext, dataContext, userQuery) {
    let prompt = `Bạn là trợ lý AI cho hệ thống quản lý khách sạn. `;
    
    prompt += `${userContext.summary}\n\n`;
    
    prompt += `PHẠM VI DỮ LIỆU BẠN CÓ THỂ TRUY VẤN:\n`;
    
    if (userContext.dataScope === 'all') {
      prompt += `- Bạn có quyền truy vấn TẤT CẢ dữ liệu trong hệ thống.\n`;
    } else if (userContext.dataScope === 'business') {
      prompt += `- Bạn chỉ có thể trả lời về các khách sạn, phòng, đặt phòng, dịch vụ và nhân viên thuộc doanh nghiệp của người dùng.\n`;
      if (dataContext.hotels.length > 0) {
        prompt += `- Các khách sạn trong phạm vi: ${dataContext.hotels.map(h => h.name).join(', ')}\n`;
      }
    } else if (userContext.dataScope === 'hotel') {
      prompt += `- Bạn chỉ có thể trả lời về phòng, đặt phòng, dịch vụ và nhân viên của khách sạn mà người dùng quản lý.\n`;
      if (dataContext.hotels.length > 0) {
        prompt += `- Khách sạn: ${dataContext.hotels[0].name}\n`;
      }
    } else {
      prompt += `- Bạn không có quyền truy vấn dữ liệu cụ thể.\n`;
    }
    
    prompt += `\nLƯU Ý QUAN TRỌNG:\n`;
    prompt += `- KHÔNG được trả lời về dữ liệu ngoài phạm vi được phép.\n`;
    prompt += `- Nếu câu hỏi liên quan đến dữ liệu ngoài phạm vi, hãy thông báo rằng bạn chỉ có thể trả lời về dữ liệu trong phạm vi của họ.\n`;
    prompt += `- Trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp.\n`;
    
    if (dataContext.hotels.length > 0 || dataContext.rooms.length > 0 || dataContext.bookings.length > 0 || (dataContext.revenue && dataContext.revenue.length > 0)) {
      prompt += `\nDỮ LIỆU HIỆN CÓ (chỉ để tham khảo, không liệt kê chi tiết nếu không được hỏi):\n`;
      
      if (dataContext.hotels.length > 0) {
        prompt += `- Khách sạn: ${dataContext.hotels.map(h => `${h.name} (${h.status})`).join(', ')}\n`;
      }
      if (dataContext.rooms.length > 0) {
        prompt += `- Số lượng phòng: ${dataContext.rooms.length} phòng\n`;
      }
      if (dataContext.bookings.length > 0) {
        prompt += `- Số lượng đặt phòng gần đây: ${dataContext.bookings.length} đặt phòng\n`;
      }
      if (dataContext.revenue && dataContext.revenue.length > 0) {
        prompt += `\n- THÔNG TIN TÀI CHÍNH (Tháng này):\n`;
        dataContext.revenue.forEach(rev => {
             prompt += `  + ${rev.hotelName}:\n`;
             prompt += `    * Tổng doanh thu: ${rev.totalRevenue.toLocaleString('vi-VN')} VNĐ\n`;
             prompt += `    * Doanh thu phòng: ${rev.roomRevenue.toLocaleString('vi-VN')} VNĐ\n`;
             prompt += `    * Doanh thu dịch vụ: ${rev.serviceRevenue.toLocaleString('vi-VN')} VNĐ\n`;
             prompt += `    * Lợi nhuận: ${rev.profit.toLocaleString('vi-VN')} VNĐ\n`;
        });
      }
    }
    
    prompt += `\nCâu hỏi của người dùng: "${userQuery}"\n\n`;
    prompt += `Hãy trả lời câu hỏi dựa trên phạm vi dữ liệu được phép và thông tin có sẵn.`;
    
    return prompt;
  }
}

module.exports = new AiContextService();

