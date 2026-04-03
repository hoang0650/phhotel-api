const { Debt } = require('../models/debt');
const { Invoice } = require('../models/invoice');
const { Room } = require('../models/rooms');
const { Booking } = require('../models/booking');
const { Hotel } = require('../models/hotel');
const mongoose = require('mongoose');

function mapRoomPaymentMethod(method) {
  const m = (method || 'cash').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'card' || m === 'credit_card' || m === 'virtual_card' || m === 'visa') return 'card';
  if (m === 'bank_transfer' || m === 'transfer' || m === 'banking') return 'transfer';
  return 'cash';
}

// ============ TẠO CÔNG NỢ ============

/**
 * Tạo công nợ từ hóa đơn
 */
exports.createDebt = async (req, res) => {
  try {
    const currentUser = req.user;
    const {
      invoiceId,
      notes,
      dueDate
    } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp invoiceId' });
    }

    // Kiểm tra xem invoice đã có công nợ chưa
    const existingDebt = await Debt.findOne({ invoiceId });
    if (existingDebt) {
      return res.status(400).json({ message: 'Hóa đơn này đã có công nợ' });
    }

    // Lấy thông tin invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
    }

    // Kiểm tra quyền truy cập
    if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      if (invoice.hotelId.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo công nợ cho hóa đơn này' });
      }
    } else if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(invoice.hotelId);
      if (hotel && hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền tạo công nợ cho hóa đơn này' });
      }
    }

    // Tính số tiền công nợ (tổng tiền - số tiền đã thanh toán)
    const debtAmount = invoice.totalAmount - (invoice.advancePayment || 0);
    
    if (debtAmount <= 0) {
      return res.status(400).json({ message: 'Hóa đơn đã được thanh toán đầy đủ, không thể tạo công nợ' });
    }

    // Tạo công nợ
    const debt = new Debt({
      hotelId: invoice.hotelId,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      roomId: invoice.roomId,
      roomNumber: invoice.roomNumber,
      bookingId: invoice.bookingId,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      customerEmail: invoice.customerEmail,
      customerId: invoice.customerId,
      guestInfo: invoice.guestInfo || invoice.guestDetails,
      createdByStaffId: currentUser._id,
      createdByStaffName: currentUser.fullName || currentUser.username || 'Nhân viên',
      debtAmount: debtAmount,
      paidAmount: 0,
      remainingAmount: debtAmount,
      status: 'pending',
      debtDate: invoice.checkOutTime || invoice.issuedDate || new Date(),
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || ''
    });

    await debt.save();

    // Cập nhật invoice status thành 'pending' (chưa thanh toán)
    invoice.paymentStatus = 'pending';
    invoice.status = 'issued';
    await invoice.save();

    res.status(201).json({
      message: 'Tạo công nợ thành công',
      debt
    });
  } catch (error) {
    console.error('Error creating debt:', error);
    res.status(500).json({ message: 'Lỗi khi tạo công nợ', error: error.message });
  }
};

// ============ LẤY DANH SÁCH CÔNG NỢ ============

/**
 * Lấy danh sách công nợ
 */
exports.getDebts = async (req, res) => {
  try {
    const currentUser = req.user;
    const {
      hotelId,
      status,
      customerId,
      page = 1,
      limit = 20,
      startDate,
      endDate
    } = req.query;

    const query = {};

    // Phân quyền theo role
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
      if (hotelId) query.hotelId = hotelId;
    } else if (currentUser.role === 'business') {
      if (!currentUser.businessId) {
        return res.status(403).json({ message: 'Bạn không có quyền xem công nợ' });
      }
      // Lấy danh sách hotels thuộc business
      const hotels = await Hotel.find({ businessId: currentUser.businessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      if (hotelIds.length === 0) {
        return res.status(200).json({ debts: [], total: 0, page: 1, totalPages: 0 });
      }
      query.hotelId = { $in: hotelIds };
      if (hotelId) {
        // Kiểm tra hotelId có thuộc business không
        if (!hotelIds.some(id => id.toString() === hotelId)) {
          return res.status(403).json({ message: 'Bạn không có quyền xem công nợ của khách sạn này' });
        }
        query.hotelId = hotelId;
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff' || currentUser.role === 'guest') {
      if (!currentUser.hotelId) {
        return res.status(403).json({ message: 'Bạn không có quyền xem công nợ' });
      }
      query.hotelId = currentUser.hotelId;
    } else {
      return res.status(403).json({ message: 'Bạn không có quyền xem công nợ' });
    }

    // Lọc theo status
    if (status) {
      query.status = status;
    }

    // Lọc theo customerId
    if (customerId) {
      query.customerId = customerId;
    }

    // Lọc theo ngày
    if (startDate || endDate) {
      query.debtDate = {};
      if (startDate) {
        query.debtDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.debtDate.$lte = new Date(endDate);
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [debts, total] = await Promise.all([
      Debt.find(query)
        .populate('invoiceId')
        .populate('roomId', 'roomNumber')
        .populate('customerId', 'fullName email phone')
        .sort({ debtDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Debt.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      debts,
      total,
      page: parseInt(page),
      totalPages
    });
  } catch (error) {
    console.error('Error getting debts:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách công nợ', error: error.message });
  }
};

/**
 * Lấy chi tiết công nợ
 */
exports.getDebtById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    const debt = await Debt.findById(id)
      .populate('invoiceId')
      .populate('roomId', 'roomNumber')
      .populate('customerId', 'fullName email phone')
      .populate('createdByStaffId', 'fullName')
      .populate('settledByStaffId', 'fullName');

    if (!debt) {
      return res.status(404).json({ message: 'Không tìm thấy công nợ' });
    }

    // Kiểm tra quyền truy cập
    if (currentUser.role === 'hotel' || currentUser.role === 'staff' || currentUser.role === 'guest') {
      if (debt.hotelId.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem công nợ này' });
      }
    } else if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(debt.hotelId);
      if (hotel && hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xem công nợ này' });
      }
    }
    // superadmin và admin không cần kiểm tra thêm

    res.status(200).json({
      message: 'Lấy chi tiết công nợ thành công',
      debt
    });
  } catch (error) {
    console.error('Error getting debt:', error);
    res.status(500).json({ message: 'Lỗi khi lấy chi tiết công nợ', error: error.message });
  }
};

// ============ THANH TOÁN CÔNG NỢ ============

/**
 * Thanh toán công nợ (một phần hoặc toàn bộ)
 */
exports.settleDebt = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const {
      amount,
      paymentMethod,
      notes
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Vui lòng nhập số tiền thanh toán hợp lệ' });
    }

    const debt = await Debt.findById(id);
    if (!debt) {
      return res.status(404).json({ message: 'Không tìm thấy công nợ' });
    }

    // Kiểm tra quyền truy cập
    // superadmin, admin: toàn quyền
    // business: toàn quyền trong khách sạn của mình
    // hotel (hotel-manager): được thanh toán trong khách sạn của mình
    // staff, guest: không được thanh toán
    if (currentUser.role === 'staff' || currentUser.role === 'guest') {
      return res.status(403).json({ message: 'Bạn không có quyền thanh toán công nợ' });
    }
    
    if (currentUser.role === 'hotel') {
      if (debt.hotelId.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền thanh toán công nợ này' });
      }
    } else if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(debt.hotelId);
      if (hotel && hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền thanh toán công nợ này' });
      }
    }
    // superadmin và admin không cần kiểm tra thêm

    // Kiểm tra số tiền thanh toán
    if (amount > debt.remainingAmount) {
      return res.status(400).json({ message: 'Số tiền thanh toán không được vượt quá số tiền còn lại' });
    }

    // Cập nhật công nợ
    debt.paidAmount = (debt.paidAmount || 0) + amount;
    debt.remainingAmount = debt.debtAmount - debt.paidAmount;

    // Thêm vào lịch sử thanh toán
    if (!debt.paymentHistory) {
      debt.paymentHistory = [];
    }

    const baseNote = 'Thanh toán từ công nợ';
    const trimmedNotes = (notes || '').trim();
    const settlementNote = trimmedNotes ? `${baseNote} - ${trimmedNotes}` : baseNote;

    debt.paymentHistory.push({
      paymentDate: new Date(),
      amount: amount,
      paymentMethod: paymentMethod || 'cash',
      staffId: currentUser._id,
      staffName: currentUser.fullName || currentUser.username || 'Nhân viên',
      notes: settlementNote
    });

    // Cập nhật status
    if (debt.remainingAmount <= 0) {
      debt.status = 'settled';
      debt.settledDate = new Date();
      debt.settledByStaffId = currentUser._id;
      debt.settledByStaffName = currentUser.fullName || currentUser.username || 'Nhân viên';
      debt.paymentMethod = paymentMethod || 'cash';
    } else if (debt.paidAmount > 0) {
      debt.status = 'partial';
    }

    await debt.save();

    // Cập nhật invoice
    const invoice = await Invoice.findById(debt.invoiceId);
    if (invoice) {
      const totalPaid = (invoice.advancePayment || 0) + debt.paidAmount;
      if (totalPaid >= invoice.totalAmount) {
        invoice.paymentStatus = 'paid';
        invoice.status = 'paid';
        invoice.paidDate = new Date();
        invoice.paymentMethod = paymentMethod || invoice.paymentMethod || 'cash';
      } else {
        invoice.paymentStatus = 'partial';
      }
      if (settlementNote) {
        if (invoice.notes && invoice.notes.trim().length > 0) {
          invoice.notes = `${invoice.notes} | ${settlementNote}`;
        } else {
          invoice.notes = settlementNote;
        }
      }
      await invoice.save();
      
      // Cập nhật room.bookingHistory để hiển thị đúng trong lịch sử đã thanh toán
      try {
        // Tìm room theo roomId từ debt hoặc tìm theo invoiceId trong bookingHistory
        let room = null;
        if (debt.roomId) {
          room = await Room.findById(debt.roomId);
        }
        
        // Nếu không tìm thấy theo roomId, tìm theo invoiceId trong bookingHistory
        if (!room) {
          room = await Room.findOne({ 
            'bookingHistory.invoiceId': debt.invoiceId 
          });
        }
        
        if (room && room.bookingHistory && room.bookingHistory.length > 0) {
          // Tìm entry trong bookingHistory có invoiceId trùng
          const historyEntry = room.bookingHistory.find(
            h => h.invoiceId && h.invoiceId.toString() === debt.invoiceId.toString()
          );
          
          if (historyEntry) {
            // Cập nhật paymentMethod và paymentStatus
            historyEntry.paymentMethod = mapRoomPaymentMethod(paymentMethod || historyEntry.paymentMethod || 'cash');
            
            if (totalPaid >= invoice.totalAmount) {
              historyEntry.paymentStatus = 'paid';
            } else {
              historyEntry.paymentStatus = 'partial';
            }
            
            // Cập nhật paidDate nếu đã thanh toán đầy đủ
            if (totalPaid >= invoice.totalAmount) {
              historyEntry.paidDate = invoice.paidDate || new Date();
            }
            
            // Cập nhật số tiền đã thanh toán (nếu có trường này)
            if (historyEntry.advancePayment !== undefined) {
              // Cập nhật advancePayment thành totalPaid
              historyEntry.advancePayment = totalPaid;
            }
            
            // Cập nhật ghi chú cho lịch sử phòng theo lần thanh toán công nợ hiện tại
            historyEntry.notes = settlementNote;
            
            // Đánh dấu đã cập nhật
            historyEntry.updatedAt = new Date();
            
            // Đánh dấu đã được cập nhật từ debt settlement
            historyEntry.updatedFromDebtSettlement = true;
            historyEntry.debtSettlementDate = new Date();
            
            // Lưu room với markModified để đảm bảo Mongoose nhận biết thay đổi trong array
            room.markModified('bookingHistory');
            await room.save();
            console.log(`Updated room.bookingHistory for invoice ${debt.invoiceId}, paymentStatus: ${historyEntry.paymentStatus}, paymentMethod: ${historyEntry.paymentMethod}`);
          } else {
            console.log(`No bookingHistory entry found for invoice ${debt.invoiceId} in room ${room._id}`);
          }
        } else {
          console.log(`No room or bookingHistory found for invoice ${debt.invoiceId}`);
        }
      } catch (roomUpdateError) {
        console.error('Error updating room.bookingHistory:', roomUpdateError);
        // Không throw error, vẫn tiếp tục để không ảnh hưởng đến quá trình thanh toán công nợ
      }
    }

    res.status(200).json({
      message: 'Thanh toán công nợ thành công',
      debt
    });
  } catch (error) {
    console.error('Error settling debt:', error);
    res.status(500).json({ message: 'Lỗi khi thanh toán công nợ', error: error.message });
  }
};

// ============ XÓA CÔNG NỢ ============

/**
 * Xóa công nợ (chỉ cho phép khi chưa thanh toán)
 */
exports.deleteDebt = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;

    const debt = await Debt.findById(id);
    if (!debt) {
      return res.status(404).json({ message: 'Không tìm thấy công nợ' });
    }

    // Kiểm tra quyền (chỉ superadmin, admin, business mới được xóa)
    // hotel-manager, staff, guest không được xóa
    if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin' && currentUser.role !== 'business') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa công nợ' });
    }
    
    // Business chỉ được xóa công nợ trong khách sạn của mình
    if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(debt.hotelId);
      if (hotel && hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa công nợ này' });
      }
    }

    // Chỉ cho phép xóa khi chưa thanh toán
    if (debt.paidAmount > 0) {
      return res.status(400).json({ message: 'Không thể xóa công nợ đã có thanh toán' });
    }

    // Cập nhật lại invoice status
    const invoice = await Invoice.findById(debt.invoiceId);
    if (invoice) {
      invoice.paymentStatus = 'paid';
      invoice.status = 'paid';
      await invoice.save();
    }

    await Debt.findByIdAndDelete(id);

    res.status(200).json({
      message: 'Xóa công nợ thành công'
    });
  } catch (error) {
    console.error('Error deleting debt:', error);
    res.status(500).json({ message: 'Lỗi khi xóa công nợ', error: error.message });
  }
};

// ============ CẬP NHẬT NHÃN CÔNG NỢ ============

/**
 * Cập nhật nhãn cho công nợ
 */
exports.updateDebtLabels = async (req, res) => {
  try {
    const currentUser = req.user;
    const { id } = req.params;
    const { labels } = req.body;

    if (!Array.isArray(labels)) {
      return res.status(400).json({ message: 'Labels phải là một mảng' });
    }

    const debt = await Debt.findById(id);
    if (!debt) {
      return res.status(404).json({ message: 'Không tìm thấy công nợ' });
    }

    // Kiểm tra quyền truy cập
    // superadmin, admin: toàn quyền
    // business: toàn quyền trong khách sạn của mình
    // hotel, staff, guest: chỉ được quản lý nhãn trong khách sạn của mình
    if (currentUser.role === 'hotel' || currentUser.role === 'staff' || currentUser.role === 'guest') {
      if (debt.hotelId.toString() !== currentUser.hotelId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật công nợ này' });
      }
    } else if (currentUser.role === 'business') {
      const hotel = await Hotel.findById(debt.hotelId);
      if (hotel && hotel.businessId?.toString() !== currentUser.businessId?.toString()) {
        return res.status(403).json({ message: 'Bạn không có quyền cập nhật công nợ này' });
      }
    }
    // superadmin và admin không cần kiểm tra thêm

    // Xử lý labels: chấp nhận cả string và object
    const cleanLabels = labels.map(label => {
      if (typeof label === 'string') {
        return {
          name: label.trim(),
          color: 'default'
        };
      } else if (label && typeof label === 'object' && label.name) {
        return {
          name: label.name.trim(),
          color: label.color || 'default'
        };
      }
      return null;
    }).filter(label => label && label.name.length > 0);

    // Loại bỏ trùng lặp dựa trên name
    const uniqueLabels = [];
    const seenNames = new Set();
    cleanLabels.forEach(label => {
      if (!seenNames.has(label.name)) {
        seenNames.add(label.name);
        uniqueLabels.push(label);
      }
    });

    debt.labels = uniqueLabels;
    await debt.save();

    res.status(200).json({
      message: 'Cập nhật nhãn thành công',
      debt
    });
  } catch (error) {
    console.error('Error updating debt labels:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật nhãn', error: error.message });
  }
};

