const { AiChatHistory } = require('../models/aiChatHistory');
const aiContextService = require('../services/aiContextService');
const axios = require('axios');

/**
 * Xử lý chat với AI Assistant
 * POST /ai-assistant/chat
 */
async function chatWithAI(req, res) {
  try {
    const { message, fileUrl, fileType } = req.body;
    const user = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({ 
        message: 'Vui lòng nhập câu hỏi' 
      });
    }

    // Lấy context của user
    const userContext = await aiContextService.getUserContext(user);
    
    // Lấy data context dựa trên query
    const dataContext = await aiContextService.getDataContext(userContext, message);
    
    // Tạo prompt context
    const promptContext = aiContextService.buildPromptContext(userContext, dataContext, message);

    // Gọi Python AI Backend (Qwen1.5-1.8B-Chat-GGUF)
    // CHỈ SỬ DỤNG Python AI Backend, không dùng model khác
    let aiResponse;
    try {
      if (process.env.PYTHON_AI_ENDPOINT) {
         // Lấy token từ header để truyền sang Python service
         const userToken = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
         aiResponse = await callPythonAI(userContext, dataContext, message, userToken);
      } else {
         throw new Error('PYTHON_AI_ENDPOINT not configured in .env');
      }
    } catch (aiError) {
      console.error('AI Service error:', aiError);
      // Fallback: trả lời đơn giản dựa trên context (không dùng AI model khác)
      aiResponse = generateFallbackResponse(userContext, dataContext, message);
    }

    // Lưu lịch sử chat
    let chatHistory = await AiChatHistory.findOne({ userId: user._id });
    
    if (!chatHistory) {
      chatHistory = new AiChatHistory({
        userId: user._id,
        hotelId: userContext.hotelId,
        businessId: userContext.businessId,
        role: user.role,
        messages: [],
        context: {
          allowedHotels: userContext.allowedHotels,
          allowedBusinesses: userContext.allowedBusinesses,
          dataScope: userContext.dataScope
        }
      });
    }

    // Thêm tin nhắn mới
    chatHistory.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
      ...(fileUrl ? { fileUrl } : {}),
      ...(fileType ? { fileType } : {})
    });

    chatHistory.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });

    // Cập nhật context nếu cần
    chatHistory.context = {
      allowedHotels: userContext.allowedHotels,
      allowedBusinesses: userContext.allowedBusinesses,
      dataScope: userContext.dataScope
    };

    await chatHistory.save();

    return res.json({
      success: true,
      response: aiResponse,
      context: {
        dataScope: userContext.dataScope,
        summary: userContext.summary
      }
    });

  } catch (error) {
    console.error('AI Assistant error:', error);
    return res.status(500).json({ 
      message: 'Đã có lỗi xảy ra khi xử lý câu hỏi',
      error: error.message 
    });
  }
}

/**
 * Gọi Python AI Backend (FastAPI)
 */
async function callPythonAI(userContext, dataContext, userQuery, userToken) {
  const pythonEndpoint = process.env.PYTHON_AI_ENDPOINT; // e.g., http://localhost:8000/chat
  
  if (!pythonEndpoint) {
    throw new Error('Python AI Endpoint not configured');
  }

  // Chuẩn bị context string (đặc biệt là dữ liệu tài chính)
  let contextString = "";
  
  // Thêm thông tin khách sạn/business
  if (dataContext.summary) {
      contextString += `${dataContext.summary}\n`;
  }

  // Thêm dữ liệu tài chính (nếu có)
  if (dataContext.revenue && dataContext.revenue.length > 0) {
    contextString += `\nTHÔNG TIN TÀI CHÍNH (Tháng này):\n`;
    dataContext.revenue.forEach(rev => {
         contextString += `- Khách sạn: ${rev.hotelName}\n`;
         contextString += `  + Tổng doanh thu: ${rev.totalRevenue.toLocaleString('vi-VN')} VNĐ\n`;
         contextString += `  + Doanh thu phòng: ${rev.roomRevenue.toLocaleString('vi-VN')} VNĐ\n`;
         contextString += `  + Doanh thu dịch vụ: ${rev.serviceRevenue.toLocaleString('vi-VN')} VNĐ\n`;
         contextString += `  + Lợi nhuận: ${rev.profit.toLocaleString('vi-VN')} VNĐ\n`;
    });
  }

  try {
    // Payload khớp với server.py: ChatPayload(tenant_id, question, context)
    // tenant_id có thể là hotelId hoặc businessId
    const tenantId = userContext.hotelId || userContext.businessId || "default";

    const response = await axios.post(
      pythonEndpoint,
      {
        tenant_id: tenantId.toString(),
        question: userQuery,
        context: contextString,
        user_token: userToken,
        user_role: userContext.role,
        user_id: userContext.userId
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000 // Tăng timeout cho model load
      }
    );

    if (response.data && response.data.answer) {
      return response.data.answer;
    }
    return "Xin lỗi, tôi không nhận được phản hồi từ hệ thống AI.";
  } catch (error) {
    console.error('Python AI API error:', error.message);
    throw error;
  }
}

/**
 * Tạo response fallback dựa trên context
 */
function generateFallbackResponse(userContext, dataContext, userQuery) {
  const queryLower = userQuery.toLowerCase();
  
  // Kiểm tra các câu hỏi phổ biến
  if (queryLower.includes('phòng') || queryLower.includes('room')) {
    if (dataContext.rooms.length > 0) {
      const availableRooms = dataContext.rooms.filter(r => r.status === 'available').length;
      const totalRooms = dataContext.rooms.length;
      return `Hiện tại bạn có ${totalRooms} phòng, trong đó có ${availableRooms} phòng đang trống. Bạn có thể xem chi tiết trong phần quản lý phòng.`;
    } else {
      return 'Hiện tại không có thông tin về phòng trong phạm vi của bạn.';
    }
  }

  if (queryLower.includes('đặt phòng') || queryLower.includes('booking')) {
    if (dataContext.bookings.length > 0) {
      const recentBookings = dataContext.bookings.slice(0, 5);
      return `Bạn có ${dataContext.bookings.length} đặt phòng gần đây. Để xem chi tiết, vui lòng vào phần quản lý đặt phòng.`;
    } else {
      return 'Hiện tại không có đặt phòng nào trong phạm vi của bạn.';
    }
  }

  if (queryLower.includes('dịch vụ') || queryLower.includes('service')) {
    if (dataContext.services.length > 0) {
      return `Bạn có ${dataContext.services.length} dịch vụ. Để xem chi tiết, vui lòng vào phần quản lý dịch vụ.`;
    } else {
      return 'Hiện tại không có dịch vụ nào trong phạm vi của bạn.';
    }
  }

  if (queryLower.includes('khách sạn') || queryLower.includes('hotel')) {
    if (dataContext.hotels.length > 0) {
      const hotelNames = dataContext.hotels.map(h => h.name).join(', ');
      return `Các khách sạn trong phạm vi của bạn: ${hotelNames}.`;
    } else {
      return 'Không có thông tin khách sạn trong phạm vi của bạn.';
    }
  }

  if (['doanh thu', 'lợi nhuận', 'thu chi', 'tài chính', 'revenue', 'profit'].some(k => queryLower.includes(k))) {
    if (dataContext.revenue && dataContext.revenue.length > 0) {
        let resp = 'Thông tin tài chính tháng này:\n';
        dataContext.revenue.forEach(rev => {
            resp += `- ${rev.hotelName}: Doanh thu ${rev.totalRevenue.toLocaleString('vi-VN')} VNĐ, Lợi nhuận ${rev.profit.toLocaleString('vi-VN')} VNĐ.\n`;
        });
        return resp;
    } else {
        return 'Không có dữ liệu tài chính trong phạm vi của bạn hoặc bạn không có quyền xem.';
    }
  }

  // Response mặc định
  return `Xin chào! Tôi là trợ lý AI của hệ thống quản lý khách sạn. ${userContext.summary} Tôi có thể giúp bạn với các câu hỏi về phòng, đặt phòng, dịch vụ và thông tin khách sạn trong phạm vi của bạn. Bạn muốn hỏi gì?`;
}

/**
 * Lấy lịch sử chat
 * GET /ai-assistant/history
 */
async function getChatHistory(req, res) {
  try {
    const user = req.user;
    
    const chatHistory = await AiChatHistory.findOne({ userId: user._id })
      .sort({ updatedAt: -1 })
      .limit(1);

    if (!chatHistory) {
      return res.json({
        success: true,
        messages: []
      });
    }

    return res.json({
      success: true,
      messages: chatHistory.messages || []
    });

  } catch (error) {
    console.error('Get chat history error:', error);
    return res.status(500).json({ 
      message: 'Đã có lỗi xảy ra khi lấy lịch sử chat',
      error: error.message 
    });
  }
}

/**
 * Xóa lịch sử chat
 * DELETE /ai-assistant/history
 */
async function deleteChatHistory(req, res) {
  try {
    const user = req.user;
    
    await AiChatHistory.deleteMany({ userId: user._id });

    return res.json({
      success: true,
      message: 'Đã xóa lịch sử chat thành công'
    });

  } catch (error) {
    console.error('Delete chat history error:', error);
    return res.status(500).json({ 
      message: 'Đã có lỗi xảy ra khi xóa lịch sử chat',
      error: error.message 
    });
  }
}

module.exports = {
  chatWithAI,
  getChatHistory,
  deleteChatHistory
};

