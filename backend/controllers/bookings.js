const { Booking } = require("../models/booking");
const { Room } = require('../models/rooms');
const { ServiceOrder } = require('../models/serviceOrder');
const { PriceConfig } = require('../models/priceConfig');
const { Hotel } = require('../models/hotel');

// Hàm tính giá phòng dựa trên cấu hình giá mới
const calculateRoomCost = async (bookingId) => {
  try {
    const booking = await getBookingAndRoomDetails(bookingId);
    if (!booking) throw new Error('Booking not found');

    const { checkInDate, checkOutDate, roomId, rateType } = booking;
    const room = await Room.findById(roomId).populate('priceConfigId');
    
    if (!room) throw new Error('Room not found');
    
    // Lấy cấu hình giá từ phòng hoặc tìm cấu hình mặc định
    let priceConfig = room.priceConfigId;
    if (!priceConfig) {
      priceConfig = await PriceConfig.findOne({
        hotelId: room.hotelId,
        roomTypeId: room.roomType,
        isActive: true
      });
    }
    
    if (!priceConfig) {
      // Sử dụng cấu hình giá mặc định từ phòng nếu không tìm thấy priceConfig
      return calculateLegacyRoomCost(room, checkInDate, checkOutDate, rateType);
    }
    
    // Tính thời gian chính xác theo phút
    const durationInMilliseconds = checkOutDate - checkInDate;
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;
    
    // Lấy giờ check-in
    const checkInHour = checkInDate.getHours();
    
    let totalCost = 0;
    
    // Tính giá dựa trên loại giá và thời gian
    switch (rateType) {
      case 'hourly':
        // KHÔNG tự động chuyển sang nightly khi chọn hourly
        // Nếu user chọn hourly, luôn tính theo giờ bình thường
        
        // Tính giá giờ đầu
        totalCost = priceConfig.hourlyRates.firstHourPrice;
        
        // Tính giá cho các giờ tiếp theo
        if (durationInHours >= 1) {
          // Giờ thứ 2 trở đi
          const gracePeriodMinutes = priceConfig.hourlyRates.gracePeriodMinutes || 15;
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
            totalCost += billableHours * priceConfig.hourlyRates.additionalHourPrice;
          }
        }
        
        // Chuyển sang tính giá ngày nếu vượt quá số giờ tối đa (KHÔNG chuyển sang nightly)
        if (durationInHours > priceConfig.hourlyRates.maxHoursBeforeDay) {
          totalCost = priceConfig.dailyRates.standardPrice;
        }
        break;
        
      case 'daily':
        // Tính số ngày (làm tròn lên)
        const durationInDays = Math.ceil(durationInHours / 24);
        totalCost = durationInDays * priceConfig.dailyRates.standardPrice;
        break;
        
      case 'nightly':
        // Kiểm tra xem thời gian check-in có phải ban đêm không
        if (checkInHour >= parseInt(priceConfig.nightlyRates.startTime.split(':')[0])) {
          // Tính số đêm (làm tròn lên)
          const durationInNights = Math.ceil(durationInHours / 24);
          totalCost = durationInNights * priceConfig.nightlyRates.standardPrice;
        } else {
          // Nếu không phải ban đêm, tính như giá ngày
          const durationInDays = Math.ceil(durationInHours / 24);
          totalCost = durationInDays * priceConfig.dailyRates.standardPrice;
        }
        break;
        
      default:
        throw new Error('Loại giá không hợp lệ');
    }

    return totalCost;
  } catch (error) {
    console.error('Error calculating room cost:', error);
    throw error;
  }
};

// Hàm tính giá theo phương pháp cũ (dùng khi không có cấu hình giá)
const calculateLegacyRoomCost = (room, checkInDate, checkOutDate, rateType) => {
  const durationInHours = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60));
  const checkInHour = checkInDate.getHours();
  const checkOutHourLimit = 22;
  
  let totalCost = 0;
  
  if (checkInHour >= checkOutHourLimit) {
    return room.nightlyRate;
  }
  
  switch (rateType) {
    case 'hourly':
      if (room.firstHourRate && room.additionalHourRate) {
        // Sử dụng giá giờ đầu và giờ tiếp theo nếu có
        totalCost = room.firstHourRate;
        if (durationInHours > 1) {
          totalCost += (durationInHours - 1) * room.additionalHourRate;
        }
      } else {
        // Sử dụng giá giờ thông thường
        totalCost = durationInHours * room.hourlyRate;
      }
      
      // Nếu số giờ > 6, chuyển sang tính ngày
      if (durationInHours > 6) {
        totalCost = room.dailyRate;
      }
      break;
      
    case 'daily':
      const durationInDays = Math.ceil(durationInHours / 24);
      totalCost = durationInDays * room.dailyRate;
      break;
      
    case 'nightly':
      const durationInNights = Math.ceil(durationInHours / 24);
      totalCost = durationInNights * room.nightlyRate;
      break;
      
    default:
      throw new Error('Unknown rate type');
  }
  
  return totalCost;
};

const getBookingAndRoomDetails = async (bookingId) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate('roomId')
      .populate('serviceOrders')
      .exec();

    return booking;
  } catch (error) {
    console.error('Error retrieving booking details:', error);
    throw error;
  }
};

// Tạo booking mới
const createBooking = async (req, res) => {
  try {
    const { 
      guestId, 
      hotelId, 
      roomId, 
      checkInDate, 
      checkOutDate, 
      rateType, 
      guestDetails 
    } = req.body;
    
    // Tìm phòng và kiểm tra trạng thái
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Không tìm thấy phòng' });
    }
    
    if (room.roomStatus !== 'available') {
      return res.status(400).json({ message: 'Phòng không khả dụng để đặt' });
    }
    
    // Tính giá dựa trên cấu hình
    const priceConfig = room.priceConfigId 
      ? await PriceConfig.findById(room.priceConfigId)
      : await PriceConfig.findOne({
          hotelId,
          roomTypeId: room.roomType,
          isActive: true
        });
    
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const durationInHours = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60));
    
    let priceDetails = {
      basePrice: 0
    };
    
    let totalAmount = 0;
    
    if (priceConfig) {
      // Tính giá dựa trên cấu hình
      switch (rateType) {
        case 'hourly':
          priceDetails.basePrice = priceConfig.hourlyRates.firstHourPrice;
          totalAmount = priceConfig.hourlyRates.firstHourPrice;
          
          if (durationInHours > 1) {
            const additionalHours = durationInHours - 1;
            const additionalPrice = additionalHours * priceConfig.hourlyRates.additionalHourPrice;
            priceDetails.additionalHoursCount = additionalHours;
            priceDetails.additionalHoursPrice = additionalPrice;
            totalAmount += additionalPrice;
          }
          
          if (durationInHours > priceConfig.hourlyRates.maxHoursBeforeDay) {
            priceDetails.basePrice = priceConfig.dailyRates.standardPrice;
            totalAmount = priceConfig.dailyRates.standardPrice;
          }
          break;
          
        case 'daily':
          const durationInDays = Math.ceil(durationInHours / 24);
          priceDetails.basePrice = priceConfig.dailyRates.standardPrice;
          priceDetails.days = durationInDays;
          totalAmount = durationInDays * priceConfig.dailyRates.standardPrice;
          break;
          
        case 'nightly':
          const checkInHour = checkIn.getHours();
          if (checkInHour >= parseInt(priceConfig.nightlyRates.startTime.split(':')[0])) {
            const durationInNights = Math.ceil(durationInHours / 24);
            priceDetails.basePrice = priceConfig.nightlyRates.standardPrice;
            priceDetails.nights = durationInNights;
            totalAmount = durationInNights * priceConfig.nightlyRates.standardPrice;
          } else {
            const durationInDays = Math.ceil(durationInHours / 24);
            priceDetails.basePrice = priceConfig.dailyRates.standardPrice;
            priceDetails.days = durationInDays;
            totalAmount = durationInDays * priceConfig.dailyRates.standardPrice;
          }
          break;
      }
    } else {
      // Sử dụng giá từ phòng nếu không có cấu hình
      switch (rateType) {
        case 'hourly':
          if (room.firstHourRate && room.additionalHourRate) {
            priceDetails.basePrice = room.firstHourRate;
            totalAmount = room.firstHourRate;
            
            if (durationInHours > 1) {
              const additionalHours = durationInHours - 1;
              const additionalPrice = additionalHours * room.additionalHourRate;
              priceDetails.additionalHoursCount = additionalHours;
              priceDetails.additionalHoursPrice = additionalPrice;
              totalAmount += additionalPrice;
            }
            
            if (durationInHours > 6) {
              priceDetails.basePrice = room.dailyRate;
              totalAmount = room.dailyRate;
            }
  } else {
            priceDetails.basePrice = room.hourlyRate;
            totalAmount = durationInHours * room.hourlyRate;
          }
          break;
          
        case 'daily':
          const durationInDays = Math.ceil(durationInHours / 24);
          priceDetails.basePrice = room.dailyRate;
          priceDetails.days = durationInDays;
          totalAmount = durationInDays * room.dailyRate;
          break;
          
        case 'nightly':
          const durationInNights = Math.ceil(durationInHours / 24);
          priceDetails.basePrice = room.nightlyRate;
          priceDetails.nights = durationInNights;
          totalAmount = durationInNights * room.nightlyRate;
          break;
      }
    }
    
    // Tạo booking mới
    const newBooking = new Booking({
      guestId,
      hotelId,
      roomId,
      checkInDate,
      checkOutDate,
      status: 'pending',
      paymentStatus: 'pending',
      rateType,
      totalAmount,
      priceDetails,
      guestDetails
    });
    
    await newBooking.save();
    
    // Cập nhật room status
    room.roomStatus = 'occupied';
    await room.save();
    
    // Cập nhật doanh thu khách sạn
    const hotel = await Hotel.findById(hotelId);
    if (hotel) {
      hotel.revenue.daily += totalAmount;
      hotel.revenue.total += totalAmount;
      hotel.revenue.history.push({
        date: new Date(),
        amount: totalAmount,
        source: 'room'
      });
      await hotel.save();
    }
    
    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(400).json({ message: error.message });
  }
};

// Xác nhận booking
const confirmBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { staffId } = req.body;
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking không tồn tại' });
    }
    
    booking.status = 'confirmed';
    booking.staffId = staffId;
    booking.actualCheckInTime = new Date();
    
    // Thêm log
    booking.logs.push({
      action: 'confirm_booking',
      staffId,
      details: 'Đã xác nhận đặt phòng'
    });
    
    await booking.save();
    
    // Cập nhật phòng
    const room = await Room.findById(booking.roomId);
    room.bookingHistory.push({
      event: 'check-in',
      date: new Date(),
      bookingId: booking._id,
      staffId,
      userId: booking.guestId
    });
    
    await room.save();
    
    res.status(200).json({ message: 'Đã xác nhận đặt phòng', booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Có lỗi xảy ra khi xác nhận đặt phòng' });
  }
};

// Check-in
const checkin = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { staffId } = req.body;
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking không tồn tại' });
    }
    
    if (booking.status !== 'confirmed' && booking.status !== 'pending') {
      return res.status(400).json({ message: 'Không thể check-in với trạng thái hiện tại' });
    }
    
    booking.status = 'checked-in';
    booking.actualCheckInTime = new Date();
    
    // Thêm log
    booking.logs.push({
      action: 'check_in',
      staffId,
      details: 'Khách đã nhận phòng'
    });
    
    await booking.save();
    
    // Cập nhật phòng
    const room = await Room.findById(booking.roomId);
    room.roomStatus = 'occupied';
    room.events.push({
      type: 'checkin',
      checkinTime: new Date(),
      userId: booking.guestId,
      staffId
    });
    
    await room.save();
    
    res.status(200).json({ message: 'Check-in thành công', booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Có lỗi xảy ra khi check-in' });
  }
};

// Check-out
const checkout = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { staffId, paymentMethod } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('roomId')
      .populate('serviceOrders');
      
    if (!booking) {
      return res.status(404).json({ message: 'Booking không tồn tại' });
    }
    
    if (booking.status !== 'checked-in') {
      return res.status(400).json({ message: 'Không thể check-out với trạng thái hiện tại' });
    }

    const checkOutTime = new Date();
    booking.checkOutDate = checkOutTime;
    booking.actualCheckOutTime = checkOutTime;
    booking.status = 'checked-out';

    // Tính lại tổng tiền dựa trên thời gian thực tế
    const recalculatedAmount = await calculateRoomCost(bookingId);
    
    // Tính tổng tiền dịch vụ
    let serviceTotal = 0;
    if (booking.serviceOrders && booking.serviceOrders.length > 0) {
      for (const orderObj of booking.serviceOrders) {
        const order = await ServiceOrder.findById(orderObj);
        if (order && order.paymentStatus !== 'paid') {
          serviceTotal += order.totalAmount;
          
          // Cập nhật trạng thái thanh toán của dịch vụ
          order.paymentStatus = 'included_in_room_charge';
          await order.save();
        }
      }
    }
    
    // Cập nhật chi tiết thanh toán
    booking.paymentDetails = {
      roomNumber: booking.roomId.roomNumber,
      amount: recalculatedAmount + serviceTotal,
      checkInTime: booking.actualCheckInTime || booking.checkInDate,
      checkOutTime,
      paymentMethod: paymentMethod || 'cash',
      paymentDate: new Date()
    };
    
    // Thêm lịch sử thanh toán
    booking.paymentDetails.paymentHistory = [{
      amount: recalculatedAmount + serviceTotal,
      date: new Date(),
      method: paymentMethod || 'cash',
      staffId
    }];
    
    booking.totalAmount = recalculatedAmount + serviceTotal;
    booking.paymentStatus = 'paid';
    
    // Thêm log
    booking.logs.push({
      action: 'check_out',
      staffId,
      details: `Khách đã trả phòng. Tổng tiền: ${recalculatedAmount + serviceTotal}`
    });

    await booking.save();

    // Cập nhật phòng
    const room = booking.roomId;
    room.roomStatus = 'dirty';
    
    // Tìm event check-in cuối cùng và cập nhật
    const lastCheckinEvent = room.events
      .filter(event => event.type === 'checkin')
      .sort((a, b) => b.checkinTime - a.checkinTime)[0];
      
    if (lastCheckinEvent) {
      lastCheckinEvent.type = 'checkout';
      lastCheckinEvent.checkoutTime = checkOutTime;
    } else {
      room.events.push({
        type: 'checkout',
        checkoutTime,
        userId: booking.guestId,
        staffId,
        payment: recalculatedAmount + serviceTotal
      });
    }
    
    room.bookingHistory.push({
      event: 'check-out',
      date: checkOutTime,
      bookingId: booking._id,
      userId: booking.guestId,
      staffId,
      amount: recalculatedAmount + serviceTotal
    });
    
    // Cập nhật doanh thu phòng
    room.revenue.total += recalculatedAmount;
    room.revenue.history.push({
      date: checkOutTime,
      amount: recalculatedAmount,
      bookingId: booking._id
    });
    
    await room.save();
    
    // Cập nhật doanh thu khách sạn
    const hotel = await Hotel.findById(booking.hotelId);
    if (hotel) {
      hotel.revenue.daily += recalculatedAmount + serviceTotal;
      hotel.revenue.total += recalculatedAmount + serviceTotal;
      hotel.revenue.history.push({
        date: checkOutTime,
        amount: recalculatedAmount + serviceTotal,
        source: 'room'
      });
      await hotel.save();
    }

    res.status(200).json({ 
      message: 'Check-out thành công!', 
      booking,
      totalAmount: recalculatedAmount + serviceTotal,
      roomCharge: recalculatedAmount,
      serviceCharge: serviceTotal
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Có lỗi xảy ra trong quá trình check-out.' });
  }
};

// Lấy tất cả bookings
const getAllBookings = async (req, res) => {
  try {
    const hotelId = req.params.hotelId || req.query.hotelId;
    
    const query = hotelId ? { hotelId } : {};
    const bookings = await Booking.find(query)
      .populate('guestId', 'username email')
      .populate('roomId', 'roomNumber roomType')
      .populate('hotelId', 'name')
      .populate('staffId', 'name')
      .sort({ createdAt: -1 });
      
    res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Có lỗi xảy ra khi lấy danh sách đặt phòng', error: error.message });
  }
};

// Lấy booking theo ID
const getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await Booking.findById(bookingId)
      .populate('guestId', 'username email')
      .populate('roomId', 'roomNumber roomType')
      .populate('hotelId', 'name')
      .populate('staffId', 'name')
      .populate({
        path: 'serviceOrders',
        populate: {
          path: 'items.serviceId',
          model: 'Service'
        }
      });
      
    if (!booking) {
      return res.status(404).json({ message: 'Không tìm thấy booking' });
    }
    
    res.status(200).json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Có lỗi xảy ra khi lấy thông tin đặt phòng' });
  }
};

// Hủy booking
const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason, staffId } = req.body;
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking không tồn tại' });
    }
    
    if (booking.status === 'checked-out') {
      return res.status(400).json({ message: 'Không thể hủy booking đã check-out' });
    }
    
    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    
    // Thêm log
    booking.logs.push({
      action: 'cancel',
      staffId,
      details: `Hủy đặt phòng. Lý do: ${reason}`
    });
    
    await booking.save();
    
    // Cập nhật trạng thái phòng nếu phòng đã bị chiếm
    if (booking.status === 'checked-in') {
      const room = await Room.findById(booking.roomId);
      room.roomStatus = 'available';
      await room.save();
    }
    
    res.status(200).json({ message: 'Đã hủy đặt phòng', booking });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Có lỗi xảy ra khi hủy đặt phòng' });
  }
};

module.exports = {
  calculateRoomCost,
  getBookingAndRoomDetails,
  createBooking,
  confirmBooking,
  checkin,
  checkout,
  getAllBookings,
  getBookingById,
  cancelBooking
};