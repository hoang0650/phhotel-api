const { ServiceOrder } = require("../models/serviceOrder");
const { Booking } = require("../models/booking");
const { Service } = require("../models/service");
const { Room } = require("../models/rooms");

// Lấy tất cả đơn đặt dịch vụ theo khách sạn
async function getAllServiceOrders(req, res) {
  try {
    const { hotelId } = req.params;
    const serviceOrders = await ServiceOrder.find({ hotelId })
      .populate('bookingId')
      .populate('roomId')
      .populate('customerId')
      .populate('staffId')
      .populate('items.serviceId');
    
    res.status(200).json(serviceOrders);
  } catch (error) {
    console.error('Error fetching service orders:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách đơn đặt dịch vụ' });
  }
}

// Lấy đơn đặt dịch vụ theo phòng
async function getServiceOrdersByRoom(req, res) {
  try {
    const { roomId } = req.params;
    const serviceOrders = await ServiceOrder.find({ roomId })
      .populate('bookingId')
      .populate('customerId')
      .populate('staffId')
      .populate('items.serviceId');
    
    res.status(200).json(serviceOrders);
  } catch (error) {
    console.error('Error fetching service orders by room:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách đơn đặt dịch vụ theo phòng' });
  }
}

// Lấy đơn đặt dịch vụ theo booking
async function getServiceOrdersByBooking(req, res) {
  try {
    const { bookingId } = req.params;
    const serviceOrders = await ServiceOrder.find({ bookingId })
      .populate('roomId')
      .populate('customerId')
      .populate('staffId')
      .populate('items.serviceId');
    
    res.status(200).json(serviceOrders);
  } catch (error) {
    console.error('Error fetching service orders by booking:', error);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách đơn đặt dịch vụ theo đặt phòng' });
  }
}

// Tạo đơn đặt dịch vụ mới
async function createServiceOrder(req, res) {
  try {
    const { bookingId, items, note } = req.body;
    
    // Kiểm tra booking tồn tại và đang trong trạng thái checked-in
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin đặt phòng' });
    }
    
    if (booking.status !== 'checked-in') {
      return res.status(400).json({ error: 'Phòng chưa được check-in' });
    }
    
    // Tính tổng tiền cho đơn hàng
    let totalAmount = 0;
    const orderItems = [];
    
    for (const item of items) {
      const service = await Service.findById(item.serviceId);
      if (!service) {
        return res.status(404).json({ error: `Không tìm thấy dịch vụ với ID: ${item.serviceId}` });
      }
      
      if (!service.available) {
        return res.status(400).json({ error: `Dịch vụ "${service.name}" hiện không khả dụng` });
      }
      
      if (service.stock < item.quantity) {
        return res.status(400).json({ error: `Dịch vụ "${service.name}" không đủ số lượng` });
      }
      
      const itemTotal = service.price * item.quantity;
      
      orderItems.push({
        serviceId: service._id,
        name: service.name,
        quantity: item.quantity,
        price: service.price,
        total: itemTotal,
        note: item.note
      });
      
      totalAmount += itemTotal;
      
      // Giảm số lượng tồn kho của dịch vụ
      service.stock -= item.quantity;
      await service.save();
    }
    
    // Tạo đơn đặt dịch vụ mới
    const newServiceOrder = new ServiceOrder({
      bookingId: booking._id,
      roomId: booking.roomId,
      hotelId: booking.hotelId,
      customerId: booking.customerId,
      staffId: req.body.staffId,
      items: orderItems,
      totalAmount,
      note,
      status: 'pending'
    });
    
    await newServiceOrder.save();
    
    // Cập nhật booking với serviceOrder mới
    booking.serviceOrders.push(newServiceOrder._id);
    await booking.save();
    
    // Cập nhật sự kiện cho phòng
    const room = await Room.findById(booking.roomId);
    room.events.push({
      type: 'service_order',
      userId: booking.customerId,
      staffId: req.body.staffId,
      serviceOrderId: newServiceOrder._id
    });
    
    room.bookingHistory.push({
      event: 'service',
      date: new Date(),
      bookingId: booking._id,
      userId: booking.customerId,
      staffId: req.body.staffId,
      serviceDetails: {
        serviceOrderId: newServiceOrder._id,
        amount: totalAmount
      }
    });
    
    await room.save();
    
    res.status(201).json(newServiceOrder);
  } catch (error) {
    console.error('Error creating service order:', error);
    res.status(400).json({ error: 'Lỗi khi tạo đơn đặt dịch vụ mới' });
  }
}

// Cập nhật trạng thái đơn đặt dịch vụ
async function updateServiceOrderStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status, staffId } = req.body;
    
    const serviceOrder = await ServiceOrder.findById(orderId);
    if (!serviceOrder) {
      return res.status(404).json({ error: 'Không tìm thấy đơn đặt dịch vụ' });
    }
    
    serviceOrder.status = status;
    if (staffId) {
      serviceOrder.staffId = staffId;
    }
    
    if (status === 'delivered') {
      serviceOrder.deliveryTime = new Date();
    }
    
    await serviceOrder.save();
    
    res.status(200).json(serviceOrder);
  } catch (error) {
    console.error('Error updating service order status:', error);
    res.status(400).json({ error: 'Lỗi khi cập nhật trạng thái đơn đặt dịch vụ' });
  }
}

// Thanh toán đơn đặt dịch vụ
async function payServiceOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { paymentMethod, staffId } = req.body;
    
    const serviceOrder = await ServiceOrder.findById(orderId);
    if (!serviceOrder) {
      return res.status(404).json({ error: 'Không tìm thấy đơn đặt dịch vụ' });
    }
    
    // Cập nhật trạng thái thanh toán
    serviceOrder.paymentStatus = 'paid';
    serviceOrder.paymentMethod = paymentMethod;
    serviceOrder.staffId = staffId;
    
    await serviceOrder.save();
    
    // Cập nhật booking nếu cần
    if (paymentMethod === 'room_charge') {
      const booking = await Booking.findById(serviceOrder.bookingId);
      booking.totalAmount += serviceOrder.totalAmount;
      await booking.save();
    }
    
    res.status(200).json(serviceOrder);
  } catch (error) {
    console.error('Error paying service order:', error);
    res.status(400).json({ error: 'Lỗi khi thanh toán đơn đặt dịch vụ' });
  }
}

// Hủy đơn đặt dịch vụ
async function cancelServiceOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    const serviceOrder = await ServiceOrder.findById(orderId);
    if (!serviceOrder) {
      return res.status(404).json({ error: 'Không tìm thấy đơn đặt dịch vụ' });
    }
    
    // Chỉ cho phép hủy đơn hàng ở trạng thái pending hoặc processing
    if (serviceOrder.status === 'delivered') {
      return res.status(400).json({ error: 'Không thể hủy đơn hàng đã giao' });
    }
    
    // Cập nhật trạng thái
    serviceOrder.status = 'cancelled';
    serviceOrder.note = serviceOrder.note ? `${serviceOrder.note}\nHủy đơn: ${reason}` : `Hủy đơn: ${reason}`;
    
    // Trả lại số lượng tồn kho
    for (const item of serviceOrder.items) {
      const service = await Service.findById(item.serviceId);
      if (service) {
        service.stock += item.quantity;
        await service.save();
      }
    }
    
    await serviceOrder.save();
    res.status(200).json(serviceOrder);
  } catch (error) {
    console.error('Error cancelling service order:', error);
    res.status(400).json({ error: 'Lỗi khi hủy đơn đặt dịch vụ' });
  }
}

module.exports = {
  getAllServiceOrders,
  getServiceOrdersByRoom,
  getServiceOrdersByBooking,
  createServiceOrder,
  updateServiceOrderStatus,
  payServiceOrder,
  cancelServiceOrder
}; 