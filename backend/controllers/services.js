const { Service } = require('../models/service');
const { ServiceOrder } = require('../models/serviceOrder');
const { Hotel } = require('../models/hotel');
const mongoose = require('mongoose');

// ==== Quản lý dịch vụ ====

// Lấy danh sách dịch vụ theo khách sạn và danh mục - với phân quyền
exports.getServices = async (req, res) => {
  try {
    const currentUser = req.user;
    const { hotelId, category } = req.query;
    
    const query = {};
    
    // Phân quyền theo role
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
      // Admin thấy tất cả
      if (hotelId) query.hotelId = hotelId;
    } else if (currentUser.role === 'business') {
      // Business chỉ thấy dịch vụ của hotels thuộc business mình
      if (!currentUser.businessId) {
        return res.status(403).json({ message: 'Bạn không có quyền xem dịch vụ' });
      }
      
      const hotels = await Hotel.find({ businessId: currentUser.businessId }).select('_id');
      const hotelIds = hotels.map(h => h._id);
      
      // Nếu không có hotel nào thuộc business này
      if (hotelIds.length === 0) {
        return res.status(200).json([]);
      }
      
      if (hotelId) {
        // Kiểm tra hotelId có thuộc business này không
        const hotelIdStr = hotelId.toString();
        const isAuthorized = hotelIds.some(id => id.toString() === hotelIdStr);
        if (isAuthorized) {
          query.hotelId = mongoose.Types.ObjectId.isValid(hotelId) ? new mongoose.Types.ObjectId(hotelId) : hotelId;
        } else {
          return res.status(403).json({ message: 'Bạn không có quyền xem dịch vụ của khách sạn này' });
        }
      } else {
        // Không có hotelId, lấy tất cả dịch vụ của các hotels thuộc business
        query.hotelId = { $in: hotelIds };
      }
    } else if (currentUser.role === 'hotel' || currentUser.role === 'staff') {
      // Hotel/staff chỉ thấy dịch vụ của hotel mình
      if (currentUser.hotelId) {
        query.hotelId = currentUser.hotelId;
      } else {
        return res.status(200).json([]);
      }
    } else {
      return res.status(200).json([]);
    }
    
    if (category) {
      query.category = category;
    }
    
    const services = await Service.find(query).sort({ category: 1, name: 1 });
    
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy dịch vụ theo ID
exports.getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });
    }
    
    res.status(200).json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tạo dịch vụ mới
exports.createService = async (req, res) => {
  try {
    const currentUser = req.user;
    const { name, description, price, category, hotelId, image, isAvailable, isActive, isCustom, currency, costPrice, importQuantity, salesQuantity } = req.body;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp hotelId' });
    }
    
    // Kiểm tra quyền
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    }
    
    // Kiểm tra quyền tạo dịch vụ cho hotel này
    if (currentUser.role === 'business' && hotel.businessId?.toString() !== currentUser.businessId) {
      return res.status(403).json({ message: 'Bạn không có quyền tạo dịch vụ cho khách sạn này' });
    }
    
    if ((currentUser.role === 'hotel' || currentUser.role === 'staff') && 
        hotel._id.toString() !== currentUser.hotelId) {
      return res.status(403).json({ message: 'Bạn không có quyền tạo dịch vụ cho khách sạn này' });
    }
    
    const serviceData = {
      name,
      price,
      category: category || 'custom',
      hotelId,
      createdAt: Date.now()
    };
    
    // Thêm các field optional
    if (description) serviceData.description = description;
    if (image) serviceData.image = image;
    if (isAvailable !== undefined) serviceData.isAvailable = isAvailable;
    if (isActive !== undefined) serviceData.isActive = isActive;
    if (isCustom !== undefined) serviceData.isCustom = isCustom;
    if (currency) serviceData.currency = currency;
    if (costPrice !== undefined) serviceData.costPrice = costPrice;
    if (importQuantity !== undefined) serviceData.importQuantity = importQuantity;
    if (salesQuantity !== undefined) serviceData.salesQuantity = salesQuantity;
    // Tự động tính tồn kho
    if (importQuantity !== undefined && salesQuantity !== undefined) {
      serviceData.inventory = Math.max(0, (importQuantity || 0) - (salesQuantity || 0));
    }
    
    const newService = new Service(serviceData);
    const savedService = await newService.save();
    
    res.status(201).json(savedService);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(400).json({ message: error.message });
  }
};

// Cập nhật dịch vụ
exports.updateService = async (req, res) => {
  try {
    const currentUser = req.user;
    const { name, description, price, category, image, isAvailable, isActive, isCustom, currency, costPrice, importQuantity, salesQuantity } = req.body;
    
    // Tìm service để kiểm tra quyền
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });
    }
    
    // Kiểm tra quyền
    const hotel = await Hotel.findById(service.hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    }
    
    if (currentUser.role === 'business' && hotel.businessId?.toString() !== currentUser.businessId) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật dịch vụ này' });
    }
    
    if ((currentUser.role === 'hotel' || currentUser.role === 'staff') && 
        hotel._id.toString() !== currentUser.hotelId) {
      return res.status(403).json({ message: 'Bạn không có quyền cập nhật dịch vụ này' });
    }
    
    // Tạo object update
    const updateData = { updatedAt: Date.now() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (category !== undefined) updateData.category = category;
    if (image !== undefined) updateData.image = image;
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isCustom !== undefined) updateData.isCustom = isCustom;
    if (currency !== undefined) updateData.currency = currency;
    if (costPrice !== undefined) updateData.costPrice = costPrice;
    if (importQuantity !== undefined) updateData.importQuantity = importQuantity;
    if (salesQuantity !== undefined) updateData.salesQuantity = salesQuantity;
    // Tự động tính tồn kho nếu có thay đổi về số lượng
    if (importQuantity !== undefined || salesQuantity !== undefined) {
      const currentService = await Service.findById(req.params.id);
      const finalImportQty = importQuantity !== undefined ? importQuantity : (currentService?.importQuantity || 0);
      const finalSalesQty = salesQuantity !== undefined ? salesQuantity : (currentService?.salesQuantity || 0);
      updateData.inventory = Math.max(0, finalImportQty - finalSalesQty);
    }
    
    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );
    
    res.status(200).json(updatedService);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(400).json({ message: error.message });
  }
};

// Xóa dịch vụ
exports.deleteService = async (req, res) => {
  try {
    const currentUser = req.user;
    
    // Tìm service để kiểm tra quyền
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });
    }
    
    // Kiểm tra quyền
    const hotel = await Hotel.findById(service.hotelId);
    if (!hotel) {
      return res.status(404).json({ message: 'Không tìm thấy khách sạn' });
    }
    
    if (currentUser.role === 'business' && hotel.businessId?.toString() !== currentUser.businessId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa dịch vụ này' });
    }
    
    if ((currentUser.role === 'hotel' || currentUser.role === 'staff') && 
        hotel._id.toString() !== currentUser.hotelId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa dịch vụ này' });
    }
    
    await Service.findByIdAndDelete(req.params.id);
    
    res.status(200).json({ message: 'Dịch vụ đã được xóa thành công' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách danh mục dịch vụ theo khách sạn
exports.getServiceCategories = async (req, res) => {
  try {
    const { hotelId } = req.query;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp hotelId' });
    }
    
    const categories = await Service.distinct('category', { hotelId });
    
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==== Quản lý đơn hàng dịch vụ ====

// Tạo đơn hàng dịch vụ
exports.createServiceOrder = async (req, res) => {
  try {
    const { roomId, hotelId, services, totalAmount, notes } = req.body;
    
    if (!roomId || !hotelId || !services || !totalAmount) {
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin' });
    }
    
    const newOrder = new ServiceOrder({
      roomId,
      hotelId,
      services,
      totalAmount,
      notes,
      requestTime: new Date(),
      status: 'pending'
    });
    
    const savedOrder = await newOrder.save();
    
    res.status(201).json(savedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Cập nhật trạng thái đơn hàng
exports.updateServiceOrderStatus = async (req, res) => {
  try {
    const { status, staffId } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Vui lòng cung cấp trạng thái' });
    }
    
    const updatedOrder = await ServiceOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status,
          staffId: staffId || undefined,
          completedTime: status === 'completed' ? new Date() : undefined
        }
      },
      { new: true }
    );
    
    if (!updatedOrder) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    
    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Lấy đơn hàng theo ID
exports.getServiceOrderById = async (req, res) => {
  try {
    const order = await ServiceOrder.findById(req.params.id)
      .populate('items.serviceId')
      .populate('staffId', 'fullName');
    
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy đơn hàng theo phòng
exports.getServiceOrdersByRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const orders = await ServiceOrder.find({ roomId })
      .sort({ orderTime: -1 })
      .populate('items.serviceId')
      .populate('staffId', 'fullName');
    
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy đơn hàng theo khách sạn với phân trang
exports.getServiceOrdersByHotel = async (req, res) => {
  try {
    const { hotelId, status, page = 1, limit = 20, startDate, endDate } = req.query;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp hotelId' });
    }
    
    const query = { hotelId };
    
    if (status) {
      query.status = status;
    }
    
    // Xử lý filter theo ngày (giống logic trong getFinancialSummary)
    // Chỉ filter nếu có startDate hoặc endDate
    if (startDate || endDate) {
      let start = startDate ? new Date(startDate) : null;
      let end = endDate ? new Date(endDate) : null;
      
      if (start) {
        start.setHours(0, 0, 0, 0);
      }
      if (end) {
        end.setHours(23, 59, 59, 999);
      }
      
      // Kiểm tra nhiều trường ngày: orderTime, createdAt, deliveryTime, updatedAt
      // Sử dụng $or để tìm orders có bất kỳ trường nào trong khoảng thời gian
      query.$or = [];
      if (start && end) {
        query.$or.push(
          { orderTime: { $gte: start, $lte: end } },
          { createdAt: { $gte: start, $lte: end } },
          { deliveryTime: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } }
        );
      } else if (start) {
        query.$or.push(
          { orderTime: { $gte: start } },
          { createdAt: { $gte: start } },
          { deliveryTime: { $gte: start } },
          { updatedAt: { $gte: start } }
        );
      } else if (end) {
        query.$or.push(
          { orderTime: { $lte: end } },
          { createdAt: { $lte: end } },
          { deliveryTime: { $lte: end } },
          { updatedAt: { $lte: end } }
        );
      }
    }
    // Nếu không có startDate và endDate, query tất cả orders của hotel (không filter theo ngày)
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { requestTime: -1 },
      populate: [
        { path: 'services.serviceId' },
        { path: 'staffId', select: 'fullName' },
        { path: 'roomId', select: 'roomNumber' }
      ]
    };
    
    // Debug: Log query để kiểm tra
    console.log('=== DEBUG getServiceOrdersByHotel ===');
    console.log('Query:', JSON.stringify(query, null, 2));
    console.log('Params:', { hotelId, status, page, limit, startDate, endDate });
    
    const totalCount = await ServiceOrder.countDocuments(query);
    console.log('Total count:', totalCount);
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const orders = await ServiceOrder.find(query)
      .sort({ orderTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.serviceId')
      .populate('staffId', 'fullName')
      .populate('roomId', 'roomNumber');
    
    console.log('Orders found:', orders.length);
    if (orders.length > 0) {
      console.log('Sample order:', {
        _id: orders[0]._id,
        hotelId: orders[0].hotelId,
        totalAmount: orders[0].totalAmount,
        itemsCount: orders[0].items?.length || 0,
        status: orders[0].status,
        paymentStatus: orders[0].paymentStatus,
        orderTime: orders[0].orderTime,
        createdAt: orders[0].createdAt
      });
    }
    console.log('=== END DEBUG ===');
    
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    
    res.status(200).json({
      orders,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Xóa đơn hàng
exports.deleteServiceOrder = async (req, res) => {
  try {
    const deletedOrder = await ServiceOrder.findByIdAndDelete(req.params.id);
    
    if (!deletedOrder) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
    
    res.status(200).json({ message: 'Đơn hàng đã được xóa thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======= ASSIGN DỊCH VỤ VÀO KHÁCH SẠN =======

// Assign dịch vụ vào khách sạn
exports.assignServiceToHotel = async (req, res) => {
  try {
    const { serviceId, hotelId } = req.body;
    
    if (!serviceId || !hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp serviceId và hotelId' });
    }

    // Kiểm tra service tồn tại
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });
    }

    // Cập nhật hotelId cho service
    service.hotelId = hotelId;
    await service.save();

    res.status(200).json({ 
      message: 'Đã assign dịch vụ vào khách sạn thành công',
      service 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk assign nhiều dịch vụ vào khách sạn
exports.bulkAssignServicesToHotel = async (req, res) => {
  try {
    const { serviceIds, hotelId } = req.body;
    
    if (!serviceIds || !hotelId || !Array.isArray(serviceIds)) {
      return res.status(400).json({ message: 'Vui lòng cung cấp danh sách serviceIds và hotelId' });
    }

    const result = await Service.updateMany(
      { _id: { $in: serviceIds } },
      { $set: { hotelId } }
    );

    res.status(200).json({ 
      message: `Đã assign ${result.modifiedCount} dịch vụ vào khách sạn`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======= DỊCH VỤ CHO MODAL CHECKIN/CHECKOUT =======

// Lấy danh sách dịch vụ đã sử dụng để tính tiền checkout
exports.getServicesForCheckout = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    if (!bookingId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp bookingId' });
    }

    // Lấy các service orders của booking
    const serviceOrders = await ServiceOrder.find({ 
      $or: [
        { bookingId },
        { roomId: bookingId } // Fallback nếu liên kết qua roomId
      ],
      status: { $ne: 'cancelled' }
    })
    .populate('items.serviceId')
    .sort({ orderTime: -1 });

    // Tính tổng tiền dịch vụ
    let totalServiceAmount = 0;
    const servicesDetail = [];

    serviceOrders.forEach(order => {
      // Model dùng items, không phải services
      const items = order.items || [];
      items.forEach(item => {
        totalServiceAmount += item.total || (item.price * item.quantity);
        servicesDetail.push({
          serviceId: item.serviceId?._id || item.serviceId,
          serviceName: item.name || item.serviceId?.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.total || (item.price * item.quantity),
          orderId: order._id,
          orderTime: order.orderTime,
          status: order.status
        });
      });
    });

    res.status(200).json({
      message: 'Lấy danh sách dịch vụ checkout thành công',
      data: {
        services: servicesDetail,
        totalAmount: totalServiceAmount,
        orderCount: serviceOrders.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tính tổng tiền dịch vụ
exports.calculateServiceTotal = async (req, res) => {
  try {
    const { services } = req.body;
    
    if (!services || !Array.isArray(services)) {
      return res.status(400).json({ message: 'Vui lòng cung cấp danh sách dịch vụ' });
    }

    let totalAmount = 0;
    const servicesWithPrice = [];

    for (const item of services) {
      const service = await Service.findById(item.serviceId);
      if (service) {
        const itemTotal = service.price * (item.quantity || 1);
        totalAmount += itemTotal;
        servicesWithPrice.push({
          serviceId: service._id,
          serviceName: service.name,
          unitPrice: service.price,
          quantity: item.quantity || 1,
          totalPrice: itemTotal
        });
      }
    }

    res.status(200).json({
      message: 'Tính tiền dịch vụ thành công',
      data: {
        services: servicesWithPrice,
        totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách dịch vụ có sẵn cho modal (checkin/checkout)
exports.getAvailableServicesForModal = async (req, res) => {
  try {
    const { hotelId } = req.query;
    
    if (!hotelId) {
      return res.status(400).json({ message: 'Vui lòng cung cấp hotelId' });
    }

    // Lấy dịch vụ đang available của khách sạn
    const services = await Service.find({ 
      hotelId, 
      isAvailable: true 
    })
    .sort({ category: 1, name: 1 });

    // Group theo category
    const groupedServices = {};
    services.forEach(service => {
      const category = service.category || 'Khác';
      if (!groupedServices[category]) {
        groupedServices[category] = [];
      }
      groupedServices[category].push({
        _id: service._id,
        name: service.name,
        price: service.price,
        description: service.description,
        image: service.image
      });
    });

    res.status(200).json({
      message: 'Lấy danh sách dịch vụ thành công',
      data: {
        services,
        grouped: groupedServices,
        total: services.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};