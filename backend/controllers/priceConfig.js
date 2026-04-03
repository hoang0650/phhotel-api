const { PriceConfig } = require("../models/priceConfig");
const { Hotel } = require("../models/hotel");
const { Room } = require("../models/rooms");

// Lấy tất cả cấu hình giá theo khách sạn
async function getPriceConfigs(req, res) {
  try {
    const { hotelId } = req.params;
    const priceConfigs = await PriceConfig.find({ 
      hotelId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: null },
        { effectiveTo: { $gte: new Date() } }
      ]
    });
    
    res.status(200).json(priceConfigs);
  } catch (error) {
    console.error('Error fetching price configs:', error);
    res.status(500).json({ error: 'Lỗi khi lấy cấu hình giá' });
  }
}

// Lấy cấu hình giá theo loại phòng
async function getPriceConfigByRoomType(req, res) {
  try {
    const { hotelId, roomTypeId } = req.params;
    const mongoose = require('mongoose');
    const isObjectId = mongoose.Types.ObjectId.isValid(roomTypeId);
    
    let priceConfig = null;
    if (isObjectId) {
      // Try by roomCategoryId first (new system)
      priceConfig = await PriceConfig.findOne({ 
        hotelId,
        roomCategoryId: roomTypeId,
        isActive: true,
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: null },
          { effectiveTo: { $gte: new Date() } }
        ]
      });
    }
    
    if (!priceConfig) {
      // Fallback to roomTypeId (legacy)
      priceConfig = await PriceConfig.findOne({ 
        hotelId,
        roomTypeId,
        isActive: true,
        $or: [
          { effectiveTo: { $exists: false } },
          { effectiveTo: null },
          { effectiveTo: { $gte: new Date() } }
        ]
      });
    }
    
    if (!priceConfig) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình giá cho loại phòng này' });
    }
    
    res.status(200).json(priceConfig);
  } catch (error) {
    console.error('Error fetching price config:', error);
    res.status(500).json({ error: 'Lỗi khi lấy cấu hình giá theo loại phòng' });
  }
}

// Tạo cấu hình giá mới
async function createPriceConfig(req, res) {
  try {
    const { hotelId } = req.params;
    
    // Kiểm tra hotel tồn tại
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) {
      return res.status(404).json({ error: 'Không tìm thấy khách sạn' });
    }
    
    // Validate dữ liệu đầu vào
    const { roomTypeId, roomCategoryId, hourlyRates, dailyRates, nightlyRates } = req.body;
    
    if (!roomTypeId) {
      return res.status(400).json({ error: 'roomTypeId là bắt buộc' });
    }
    
    if (!hourlyRates || !hourlyRates.firstHourPrice || !hourlyRates.additionalHourPrice) {
      return res.status(400).json({ error: 'hourlyRates.firstHourPrice và hourlyRates.additionalHourPrice là bắt buộc' });
    }
    
    if (!dailyRates || !dailyRates.standardPrice) {
      return res.status(400).json({ error: 'dailyRates.standardPrice là bắt buộc' });
    }
    
    if (!nightlyRates || !nightlyRates.standardPrice) {
      return res.status(400).json({ error: 'nightlyRates.standardPrice là bắt buộc' });
    }
    
    // Tạo cấu hình giá mới với dữ liệu đã validate
    const newPriceConfig = new PriceConfig({
      hotelId,
      roomTypeId,
      roomCategoryId: roomCategoryId || null,
      hourlyRates: {
        firstHourPrice: Number(hourlyRates.firstHourPrice),
        additionalHourPrice: Number(hourlyRates.additionalHourPrice),
        maxHoursBeforeDay: hourlyRates.maxHoursBeforeDay ? Number(hourlyRates.maxHoursBeforeDay) : 6,
        gracePeriodMinutes: hourlyRates.gracePeriodMinutes ? Number(hourlyRates.gracePeriodMinutes) : 15,
        autoNightlyHours: hourlyRates.autoNightlyHours ? Number(hourlyRates.autoNightlyHours) : 8
      },
      dailyRates: {
        standardPrice: Number(dailyRates.standardPrice),
        weekendSurcharge: dailyRates.weekendSurcharge ? Number(dailyRates.weekendSurcharge) : 0,
        holidaySurcharge: dailyRates.holidaySurcharge ? Number(dailyRates.holidaySurcharge) : 0,
        checkInTime: dailyRates.checkInTime || '14:00',
        checkOutTime: dailyRates.checkOutTime || '12:00',
        earlyCheckinSurcharge: dailyRates.earlyCheckinSurcharge ? Number(dailyRates.earlyCheckinSurcharge) : 0,
        latecheckOutFee: dailyRates.latecheckOutFee ? Number(dailyRates.latecheckOutFee) : 0
      },
      nightlyRates: {
        standardPrice: Number(nightlyRates.standardPrice),
        startTime: nightlyRates.startTime || '20:00',
        endTime: nightlyRates.endTime || '12:00',
        weekendSurcharge: nightlyRates.weekendSurcharge ? Number(nightlyRates.weekendSurcharge) : 0,
        holidaySurcharge: nightlyRates.holidaySurcharge ? Number(nightlyRates.holidaySurcharge) : 0,
        earlyCheckinSurcharge: nightlyRates.earlyCheckinSurcharge ? Number(nightlyRates.earlyCheckinSurcharge) : 0,
        lateCheckoutSurcharge: nightlyRates.lateCheckoutSurcharge ? Number(nightlyRates.lateCheckoutSurcharge) : 0,
        autoDailyHours: nightlyRates.autoDailyHours ? Number(nightlyRates.autoDailyHours) : 24
      },
      discounts: req.body.discounts || [],
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date(),
      effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : undefined
    });
    
    await newPriceConfig.save();
    
    // Cập nhật giá cho các phòng có cùng loại
    if (req.body.updateRooms === true) {
      const queryConditions = [{ type: req.body.roomTypeId }];
      if (req.body.roomCategoryId) {
        queryConditions.push({ roomCategoryId: req.body.roomCategoryId });
      }
      const rooms = await Room.find({ 
        hotelId, 
        $or: queryConditions
      });
      
      for (const room of rooms) {
        room.priceConfigId = newPriceConfig._id;
        room.hourlyRate = newPriceConfig.hourlyRates.firstHourPrice;
        room.firstHourRate = newPriceConfig.hourlyRates.firstHourPrice;
        room.additionalHourRate = newPriceConfig.hourlyRates.additionalHourPrice;
        room.dailyRate = newPriceConfig.dailyRates.standardPrice;
        room.nightlyRate = newPriceConfig.nightlyRates.standardPrice;
        await room.save();
      }
    }
    
    res.status(201).json(newPriceConfig);
  } catch (error) {
    console.error('Error creating price config:', error);
    res.status(400).json({ error: 'Lỗi khi tạo cấu hình giá mới' });
  }
}

// Cập nhật cấu hình giá
async function updatePriceConfig(req, res) {
  try {
    const { configId } = req.params;
    
    // Tìm cấu hình hiện tại
    const existingConfig = await PriceConfig.findById(configId);
    if (!existingConfig) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình giá' });
    }
    
    // Chuẩn bị dữ liệu cập nhật
    const updates = {};
    
    if (req.body.roomTypeId) updates.roomTypeId = req.body.roomTypeId;
    
    if (req.body.hourlyRates) {
      updates.hourlyRates = {
        firstHourPrice: req.body.hourlyRates.firstHourPrice !== undefined 
          ? Number(req.body.hourlyRates.firstHourPrice) 
          : existingConfig.hourlyRates.firstHourPrice,
        additionalHourPrice: req.body.hourlyRates.additionalHourPrice !== undefined 
          ? Number(req.body.hourlyRates.additionalHourPrice) 
          : existingConfig.hourlyRates.additionalHourPrice,
        maxHoursBeforeDay: req.body.hourlyRates.maxHoursBeforeDay !== undefined 
          ? Number(req.body.hourlyRates.maxHoursBeforeDay) 
          : (existingConfig.hourlyRates.maxHoursBeforeDay || 6),
        gracePeriodMinutes: req.body.hourlyRates.gracePeriodMinutes !== undefined 
          ? Number(req.body.hourlyRates.gracePeriodMinutes) 
          : (existingConfig.hourlyRates.gracePeriodMinutes || 15),
        autoNightlyHours: req.body.hourlyRates.autoNightlyHours !== undefined 
          ? Number(req.body.hourlyRates.autoNightlyHours) 
          : (existingConfig.hourlyRates.autoNightlyHours || 8)
      };
    }
    
    if (req.body.dailyRates) {
      updates.dailyRates = {
        standardPrice: req.body.dailyRates.standardPrice !== undefined 
          ? Number(req.body.dailyRates.standardPrice) 
          : existingConfig.dailyRates.standardPrice,
        weekendSurcharge: req.body.dailyRates.weekendSurcharge !== undefined 
          ? Number(req.body.dailyRates.weekendSurcharge) 
          : (existingConfig.dailyRates.weekendSurcharge || 0),
        holidaySurcharge: req.body.dailyRates.holidaySurcharge !== undefined 
          ? Number(req.body.dailyRates.holidaySurcharge) 
          : (existingConfig.dailyRates.holidaySurcharge || 0),
        checkInTime: req.body.dailyRates.checkInTime || existingConfig.dailyRates.checkInTime || '14:00',
        checkOutTime: req.body.dailyRates.checkOutTime || existingConfig.dailyRates.checkOutTime || '12:00',
        earlyCheckinSurcharge: req.body.dailyRates.earlyCheckinSurcharge !== undefined 
          ? Number(req.body.dailyRates.earlyCheckinSurcharge) 
          : (existingConfig.dailyRates.earlyCheckinSurcharge || 0),
        latecheckOutFee: req.body.dailyRates.latecheckOutFee !== undefined 
          ? Number(req.body.dailyRates.latecheckOutFee) 
          : (existingConfig.dailyRates.latecheckOutFee || 0)
      };
    }
    
    if (req.body.nightlyRates) {
      updates.nightlyRates = {
        standardPrice: req.body.nightlyRates.standardPrice !== undefined 
          ? Number(req.body.nightlyRates.standardPrice) 
          : existingConfig.nightlyRates.standardPrice,
        startTime: req.body.nightlyRates.startTime || existingConfig.nightlyRates.startTime || '20:00',
        endTime: req.body.nightlyRates.endTime || existingConfig.nightlyRates.endTime || '12:00',
        weekendSurcharge: req.body.nightlyRates.weekendSurcharge !== undefined 
          ? Number(req.body.nightlyRates.weekendSurcharge) 
          : (existingConfig.nightlyRates.weekendSurcharge || 0),
        holidaySurcharge: req.body.nightlyRates.holidaySurcharge !== undefined 
          ? Number(req.body.nightlyRates.holidaySurcharge) 
          : (existingConfig.nightlyRates.holidaySurcharge || 0),
        earlyCheckinSurcharge: req.body.nightlyRates.earlyCheckinSurcharge !== undefined 
          ? Number(req.body.nightlyRates.earlyCheckinSurcharge) 
          : (existingConfig.nightlyRates.earlyCheckinSurcharge || 0),
        lateCheckoutSurcharge: req.body.nightlyRates.lateCheckoutSurcharge !== undefined 
          ? Number(req.body.nightlyRates.lateCheckoutSurcharge) 
          : (existingConfig.nightlyRates.lateCheckoutSurcharge || 0),
        autoDailyHours: req.body.nightlyRates.autoDailyHours !== undefined 
          ? Number(req.body.nightlyRates.autoDailyHours) 
          : (existingConfig.nightlyRates.autoDailyHours || 24)
      };
    }
    
    if (req.body.discounts !== undefined) updates.discounts = req.body.discounts;
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    if (req.body.effectiveFrom) updates.effectiveFrom = new Date(req.body.effectiveFrom);
    if (req.body.effectiveTo) updates.effectiveTo = new Date(req.body.effectiveTo);
    
    const updatedConfig = await PriceConfig.findByIdAndUpdate(
      configId,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!updatedConfig) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình giá' });
    }
    
    // Cập nhật giá cho các phòng nếu được yêu cầu
    if (req.body.updateRooms === true) {
      const queryConditions = { 
        hotelId: updatedConfig.hotelId,
        $or: [
          { priceConfigId: updatedConfig._id },
          { type: updatedConfig.roomTypeId }
        ]
      };
      if (updatedConfig.roomCategoryId) {
        queryConditions.$or.push({ roomCategoryId: updatedConfig.roomCategoryId });
      }
      const rooms = await Room.find(queryConditions);
      
      for (const room of rooms) {
        room.hourlyRate = updatedConfig.hourlyRates.firstHourPrice;
        room.firstHourRate = updatedConfig.hourlyRates.firstHourPrice;
        room.additionalHourRate = updatedConfig.hourlyRates.additionalHourPrice;
        room.dailyRate = updatedConfig.dailyRates.standardPrice;
        room.nightlyRate = updatedConfig.nightlyRates.standardPrice;
        await room.save();
      }
    }
    
    res.status(200).json(updatedConfig);
  } catch (error) {
    console.error('Error updating price config:', error);
    res.status(400).json({ error: 'Lỗi khi cập nhật cấu hình giá' });
  }
}

// Vô hiệu hóa cấu hình giá
async function deactivatePriceConfig(req, res) {
  try {
    const { configId } = req.params;
    const config = await PriceConfig.findById(configId);
    
    if (!config) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình giá' });
    }
    
    config.isActive = false;
    config.effectiveTo = new Date();
    await config.save();
    
    res.status(200).json({ message: 'Đã vô hiệu hóa cấu hình giá' });
  } catch (error) {
    console.error('Error deactivating price config:', error);
    res.status(500).json({ error: 'Lỗi khi vô hiệu hóa cấu hình giá' });
  }
}

// Helper function để tính giá phòng (có thể import và sử dụng trong các controller khác)
async function calculateRoomPriceHelper(room, checkInDate, checkOutDate, rateType) {
  try {
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    const durationInMilliseconds = checkOut - checkIn;
    const durationInMinutes = Math.floor(durationInMilliseconds / (1000 * 60));
    const durationInHours = Math.floor(durationInMinutes / 60);
    const remainingMinutes = durationInMinutes % 60;

    // Lấy cấu hình giá từ phòng hoặc tìm cấu hình mặc định
    let priceConfig = null;
    
    // Nếu room.priceConfigId đã được populate (là object)
    if (room.priceConfigId && typeof room.priceConfigId === 'object' && room.priceConfigId._id) {
      priceConfig = room.priceConfigId;
    } else if (room.priceConfigId) {
      // Nếu là ObjectId, tìm lại
      priceConfig = await PriceConfig.findById(room.priceConfigId);
    }
    
    // Nếu chưa có, tìm theo roomType (thử cả room.type và room.roomType)
    if (!priceConfig && room.hotelId) {
      const roomTypeId = room.type || room.roomType;
      if (roomTypeId) {
        priceConfig = await PriceConfig.findOne({
          hotelId: room.hotelId,
          roomTypeId: roomTypeId,
          isActive: true,
          $or: [
            { effectiveTo: { $exists: false } },
            { effectiveTo: null },
            { effectiveTo: { $gte: new Date() } }
          ]
        }).sort({ effectiveFrom: -1 });
      }
    }
    
    if (!priceConfig) {
      console.warn('PriceConfig not found for room, using legacy room rates:', {
        roomId: room._id,
        roomNumber: room.roomNumber,
        hotelId: room.hotelId,
        type: room.type,
        roomType: room.roomType,
        priceConfigId: room.priceConfigId
      });

      let totalPrice = 0;
      let priceDetails = {};

      switch (rateType) {
        case 'hourly': {
          const firstHourRate = room.firstHourRate || room.hourlyRate || 0;
          const additionalHourRate = room.additionalHourRate || room.hourlyRate || 0;

          if (firstHourRate > 0 || additionalHourRate > 0) {
            priceDetails.basePrice = firstHourRate;
            totalPrice = firstHourRate;

            if (durationInHours > 1) {
              const additionalHours = durationInHours - 1;
              const additionalPrice = additionalHours * additionalHourRate;
              priceDetails.additionalHoursCount = additionalHours;
              priceDetails.additionalHoursPrice = additionalPrice;
              totalPrice += additionalPrice;
            }

            if (durationInHours > 6 && room.dailyRate) {
              priceDetails.basePrice = room.dailyRate;
              totalPrice = room.dailyRate;
            }
          } else {
            const hourlyRate = room.hourlyRate || 0;
            priceDetails.basePrice = hourlyRate;
            totalPrice = durationInHours * hourlyRate;
          }

          priceDetails.rateType = 'hourly';
          break;
        }

        case 'daily': {
          const durationInDays = Math.max(1, Math.ceil(durationInHours / 24));
          const dailyRate = room.dailyRate || room.nightlyRate || room.hourlyRate || 0;
          priceDetails.basePrice = dailyRate;
          priceDetails.days = durationInDays;
          priceDetails.rateType = 'daily';
          totalPrice = durationInDays * dailyRate;
          break;
        }

        case 'nightly': {
          const durationInNights = Math.max(1, Math.ceil(durationInHours / 24));
          const nightlyRate = room.nightlyRate || room.dailyRate || room.hourlyRate || 0;
          priceDetails.basePrice = nightlyRate;
          priceDetails.nights = durationInNights;
          priceDetails.rateType = 'nightly';
          totalPrice = durationInNights * nightlyRate;
          break;
        }

        default:
          throw new Error('Loại giá không hợp lệ');
      }

      const finalRateTypeFallback = priceDetails.rateType || rateType;

      return {
        totalPrice,
        priceDetails,
        durationInHours,
        rateType: finalRateTypeFallback,
        originalRateType: rateType !== finalRateTypeFallback ? rateType : undefined
      };
    }
    
    // Lấy giờ check-in
    const checkInHour = checkIn.getHours();
    
    let totalPrice = 0;
    let priceDetails = {};
    
    // Tính giá dựa trên loại giá và thời gian
    switch (rateType) {
      case 'hourly':
        // Kiểm tra xem priceConfig có hourlyRates không
        if (!priceConfig.hourlyRates) {
          throw new Error('Cấu hình giá không có thông tin giá theo giờ (hourlyRates)');
        }
        
        // Hourly rate: KHÔNG tính phụ thu sớm/trễ, chỉ tính theo giờ đơn giản
        const gracePeriodMinutes = priceConfig.hourlyRates.gracePeriodMinutes || 15;
        
        // Tính giá giờ đầu
        const firstHourPrice = priceConfig.hourlyRates.firstHourPrice || 0;
        const additionalHourPrice = priceConfig.hourlyRates.additionalHourPrice || 0;
        
        if (firstHourPrice === 0 && additionalHourPrice === 0) {
          throw new Error('Cấu hình giá theo giờ chưa được thiết lập (firstHourPrice hoặc additionalHourPrice)');
        }
        
        totalPrice = firstHourPrice;
        priceDetails.firstHourPrice = firstHourPrice;
        
        // Tính giá cho các giờ tiếp theo
        if (durationInHours >= 1) {
          let billableHours = durationInHours - 1; // Số giờ tính phí (trừ giờ đầu)
          
          // Nếu có thời gian dư sau giờ thứ 2
          if (durationInHours >= 2 && remainingMinutes > gracePeriodMinutes) {
            billableHours += 1;
          } else if (durationInHours === 1 && remainingMinutes > gracePeriodMinutes) {
            billableHours = 1;
          }
          
          if (billableHours > 0) {
            const additionalPrice = billableHours * additionalHourPrice;
            totalPrice += additionalPrice;
            priceDetails.additionalHoursCount = billableHours;
            priceDetails.additionalHoursPrice = additionalPrice;
            priceDetails.remainingMinutes = remainingMinutes;
            priceDetails.gracePeriodMinutes = gracePeriodMinutes;
          }
        }
        
        // KHÔNG tự động chuyển sang nightly hoặc daily khi chọn hourly
        // Nếu user chọn hourly, luôn tính theo giờ bình thường
        // Chỉ kiểm tra maxHoursBeforeDay để chuyển sang daily (nếu cần)
        const maxHoursBeforeDay = priceConfig.hourlyRates.maxHoursBeforeDay;
        if (maxHoursBeforeDay && durationInHours > maxHoursBeforeDay && priceConfig.dailyRates && priceConfig.dailyRates.standardPrice) {
          // Chuyển sang tính giá ngày nếu vượt quá số giờ tối đa
          totalPrice = priceConfig.dailyRates.standardPrice;
          priceDetails = {
            basePrice: priceConfig.dailyRates.standardPrice,
            rateType: 'daily',
            autoConverted: true,
            originalRateType: 'hourly',
            reason: `Vượt quá ${maxHoursBeforeDay} giờ (${durationInHours} giờ)`
          };
        } else {
          priceDetails.rateType = 'hourly';
          priceDetails.note = 'Tính theo giờ bình thường, không tính phụ thu sớm/trễ';
        }
        break;
        
      case 'daily':
        // Kiểm tra xem priceConfig có dailyRates không
        if (!priceConfig.dailyRates || !priceConfig.dailyRates.standardPrice) {
          throw new Error('Cấu hình giá không có thông tin giá ngày đêm (dailyRates.standardPrice)');
        }
        
        // Tính số ngày dựa trên ngày thực tế (qua đêm), không làm tròn từ giờ
        const checkInDateForDaily = new Date(checkInDate);
        checkInDateForDaily.setHours(0, 0, 0, 0);
        const checkOutDateForDaily = new Date(checkOutDate);
        checkOutDateForDaily.setHours(0, 0, 0, 0);
        const actualDaysForDaily = Math.max(1, Math.ceil((checkOutDateForDaily.getTime() - checkInDateForDaily.getTime()) / (1000 * 60 * 60 * 24)));
        const durationInDays = actualDaysForDaily;
        totalPrice = durationInDays * priceConfig.dailyRates.standardPrice;
        priceDetails.basePrice = priceConfig.dailyRates.standardPrice;
        priceDetails.days = durationInDays;
        priceDetails.rateType = 'daily';
        
        // Thời gian quy định cho ngày đêm: 12:00 - 12:00 ngày hôm sau
        // Chỉ tính phụ thu nếu check-in trước 12:00 hoặc check-out sau 12:00 ngày hôm sau
        const dailyStartTime = priceConfig.dailyRates?.checkInTime || '12:00';; // Thời gian bắt đầu nhận ngày đêm
        const dailyCheckOutTime = priceConfig.dailyRates?.checkOutTime || '12:00'; // Thời gian kết thúc
        
        const [dailyStartHour, dailyStartMinute] = dailyStartTime.split(':').map(Number);
        const [dailyCheckOutHour, dailyCheckOutMinute] = dailyCheckOutTime.split(':').map(Number);
        const checkInMinutesForDaily = checkIn.getHours() * 60 + checkIn.getMinutes();
        const checkOutMinutesForDaily = checkOut.getHours() * 60 + checkOut.getMinutes();
        const dailyStartMinutes = dailyStartHour * 60 + dailyStartMinute;
        const dailyCheckOutMinutes = dailyCheckOutHour * 60 + dailyCheckOutMinute;
        
        // Tính phụ thu check-in sớm (nếu check-in trước 12:00 - thời gian bắt đầu nhận ngày đêm)
        if (checkInMinutesForDaily < dailyStartMinutes) {
          const earlyMinutesDaily = dailyStartMinutes - checkInMinutesForDaily;
          const earlyCheckinHoursDaily = Math.ceil(earlyMinutesDaily / 60); // Làm tròn lên
          const earlyCheckinSurchargeDaily = earlyCheckinHoursDaily * (priceConfig.dailyRates?.earlyCheckinSurcharge || 0);
          if (earlyCheckinSurchargeDaily > 0) {
            totalPrice += earlyCheckinSurchargeDaily;
            priceDetails.earlyCheckinHours = earlyCheckinHoursDaily;
            priceDetails.earlyCheckinSurcharge = earlyCheckinSurchargeDaily;
          }
        }
        
        // Tính phụ thu check-out trễ (nếu check-out sau 12:00 ngày hôm sau)
        // Kiểm tra xem check-out có phải ngày hôm sau không
        const checkOutDate = new Date(checkOutDate);
        checkOutDate.setHours(0, 0, 0, 0);
        const checkInDateOnly = new Date(checkInDate);
        checkInDateOnly.setHours(0, 0, 0, 0);
        const isNextDay = checkOutDate.getTime() > checkInDateOnly.getTime();
        
        if (isNextDay && checkOutMinutesForDaily > dailyCheckOutMinutes) {
          // Check-out sau 12:00 ngày hôm sau
          const lateMinutesDaily = checkOutMinutesForDaily - dailyCheckOutMinutes;
          const lateCheckoutHoursDaily = Math.ceil(lateMinutesDaily / 60); // Làm tròn lên
          const lateCheckoutFeeDaily = lateCheckoutHoursDaily * (priceConfig.dailyRates?.latecheckOutFee || 0);
          if (lateCheckoutFeeDaily > 0) {
            totalPrice += lateCheckoutFeeDaily;
            priceDetails.lateCheckoutHours = lateCheckoutHoursDaily;
            priceDetails.lateCheckoutSurcharge = lateCheckoutFeeDaily;
          }
        } else if (!isNextDay && checkOutMinutesForDaily > dailyCheckOutMinutes) {
          // Check-out cùng ngày nhưng sau 12:00 (trường hợp đặc biệt)
          const lateMinutesDaily = checkOutMinutesForDaily - dailyCheckOutMinutes;
          const lateCheckoutHoursDaily = Math.ceil(lateMinutesDaily / 60); // Làm tròn lên
          const lateCheckoutFeeDaily = lateCheckoutHoursDaily * (priceConfig.dailyRates?.latecheckOutFee || 0);
          if (lateCheckoutFeeDaily > 0) {
            totalPrice += lateCheckoutFeeDaily;
            priceDetails.lateCheckoutHours = lateCheckoutHoursDaily;
            priceDetails.lateCheckoutSurcharge = lateCheckoutFeeDaily;
          }
        }
        break;
        
      case 'nightly':
        // Kiểm tra xem priceConfig có nightlyRates không
        if (!priceConfig.nightlyRates || !priceConfig.nightlyRates.standardPrice) {
          throw new Error('Cấu hình giá không có thông tin giá qua đêm (nightlyRates.standardPrice)');
        }
        
        // Lấy thời gian quy định
        const nightlyStartTime2 = priceConfig.nightlyRates.startTime || '20:00';
        const nightlyEndTime2 = priceConfig.nightlyRates.endTime || '12:00';
        const autoDailyHours = priceConfig.nightlyRates.autoDailyHours || 24;
        
        // Parse thời gian quy định
        const [startHour2, startMinute2] = nightlyStartTime2.split(':').map(Number);
        const [endHour2, endMinute2] = nightlyEndTime2.split(':').map(Number);
        
        // Tính thời gian check-in/check-out theo phút trong ngày
        const checkInMinutes2 = checkIn.getHours() * 60 + checkIn.getMinutes();
        const checkOutMinutes2 = checkOut.getHours() * 60 + checkOut.getMinutes();
        const startTimeMinutes2 = startHour2 * 60 + startMinute2;
        const endTimeMinutes2 = endHour2 * 60 + endMinute2;
        
        // Kiểm tra nếu vượt quá autoDailyHours thì tự động chuyển sang daily rate
        if (durationInHours > autoDailyHours && priceConfig.dailyRates && priceConfig.dailyRates.standardPrice) {
          // Tự động chuyển sang daily rate
          const durationInDays = Math.ceil(durationInHours / 24);
          totalPrice = durationInDays * priceConfig.dailyRates.standardPrice;
          priceDetails = {
            basePrice: priceConfig.dailyRates.standardPrice,
            rateType: 'daily',
            days: durationInDays,
            autoConverted: true,
            originalRateType: 'nightly',
            reason: `Vượt quá ${autoDailyHours} giờ (${durationInHours} giờ)`
          };
        } else {
          // Tính giá qua đêm - tính số đêm dựa trên đêm thực tế (qua đêm)
          const checkInDateForNightly = new Date(checkInDate);
          checkInDateForNightly.setHours(0, 0, 0, 0);
          const checkOutDateForNightly = new Date(checkOutDate);
          checkOutDateForNightly.setHours(0, 0, 0, 0);
          const actualNightsForNightly = Math.max(1, Math.ceil((checkOutDateForNightly.getTime() - checkInDateForNightly.getTime()) / (1000 * 60 * 60 * 24)));
          const durationInNights = actualNightsForNightly;
          totalPrice = durationInNights * priceConfig.nightlyRates.standardPrice;
          priceDetails.basePrice = priceConfig.nightlyRates.standardPrice;
          priceDetails.rateType = 'nightly';
          priceDetails.nights = durationInNights;
          
          // Tính phụ thu check-in sớm (nếu check-in trước startTime - 20:00)
          // Thời gian quy định qua đêm: 20:00 - 12:00 ngày hôm sau
          let earlyCheckinHours2 = 0;
          if (checkInMinutes2 < startTimeMinutes2) {
            // Check-in sớm, tính số giờ sớm (làm tròn lên)
            const earlyMinutes = startTimeMinutes2 - checkInMinutes2;
            earlyCheckinHours2 = Math.ceil(earlyMinutes / 60); // Làm tròn lên
            const earlyCheckinSurcharge2 = earlyCheckinHours2 * (priceConfig.nightlyRates.earlyCheckinSurcharge || 0);
            if (earlyCheckinSurcharge2 > 0) {
              totalPrice += earlyCheckinSurcharge2;
              priceDetails.earlyCheckinHours = earlyCheckinHours2;
              priceDetails.earlyCheckinSurcharge = earlyCheckinSurcharge2;
            }
          }
          
          // Tính phụ thu check-out muộn (nếu check-out sau endTime - 12:00)
          // Kiểm tra xem check-out có phải ngày hôm sau không
          const checkOutDateForNightlyCheck = new Date(checkOutDate);
          checkOutDateForNightlyCheck.setHours(0, 0, 0, 0);
          const checkInDateForNightlyCheck = new Date(checkInDate);
          checkInDateForNightlyCheck.setHours(0, 0, 0, 0);
          const isNextDayForNightly = checkOutDateForNightlyCheck.getTime() > checkInDateForNightlyCheck.getTime();
          
          let lateCheckoutHours2 = 0;
          if (isNextDayForNightly && checkOutMinutes2 > endTimeMinutes2) {
            // Check-out sau 12:00 ngày hôm sau
            const lateMinutes = checkOutMinutes2 - endTimeMinutes2;
            lateCheckoutHours2 = Math.ceil(lateMinutes / 60); // Làm tròn lên
            const lateCheckoutSurcharge2 = lateCheckoutHours2 * (priceConfig.nightlyRates.lateCheckoutSurcharge || 0);
            if (lateCheckoutSurcharge2 > 0) {
              totalPrice += lateCheckoutSurcharge2;
              priceDetails.lateCheckoutHours = lateCheckoutHours2;
              priceDetails.lateCheckoutSurcharge = lateCheckoutSurcharge2;
            }
          }
        }
        break;
        
      default:
        throw new Error('Loại giá không hợp lệ');
    }
    
    // Lấy rateType cuối cùng từ priceDetails (có thể đã được tự động chuyển đổi)
    const finalRateType = priceDetails.rateType || rateType;
    
    return {
      totalPrice,
      priceDetails,
      durationInHours,
      rateType: finalRateType,
      originalRateType: rateType !== finalRateType ? rateType : undefined
    };
  } catch (error) {
    console.error('Error calculating room price:', error);
    throw error;
  }
}

// Tính giá phòng dựa trên thời gian check-in/check-out (API endpoint)
async function calculateRoomPrice(req, res) {
  try {
    const { roomId, checkInDate, checkOutDate, rateType } = req.body;
    
    const room = await Room.findById(roomId).populate('priceConfigId');
    if (!room) {
      return res.status(404).json({ error: 'Không tìm thấy phòng' });
    }
    
    const result = await calculateRoomPriceHelper(room, checkInDate, checkOutDate, rateType);
    
    res.status(200).json({
      roomId,
      ...result
    });
  } catch (error) {
    console.error('Error calculating room price:', error);
    // Trả về thông báo lỗi chi tiết hơn để debug
    const errorMessage = error.message || 'Lỗi khi tính giá phòng';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = {
  getPriceConfigs,
  getPriceConfigByRoomType,
  createPriceConfig,
  updatePriceConfig,
  deactivatePriceConfig,
  calculateRoomPrice,
  calculateRoomPriceHelper
}; 