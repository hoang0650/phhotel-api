const { RoomCategory } = require('../models/roomCategory');
const { Room } = require('../models/rooms');
const { PriceConfig } = require('../models/priceConfig');
const mongoose = require('mongoose');

/**
 * Tạo loại phòng mới
 * POST /api/room-categories
 */
exports.create = async (req, res) => {
    try {
        const { hotelId, name, description, pricing, firstHourRate, additionalHourRate, capacity, amenities, priceSettings } = req.body;

        // Validation
        if (!hotelId || !name) {
            return res.status(400).json({ 
                message: 'hotelId và name là bắt buộc' 
            });
        }

        const roomCategory = new RoomCategory({
            hotelId: new mongoose.Types.ObjectId(hotelId),
            name,
            description: description || '',
            pricing: pricing || {},
            firstHourRate: firstHourRate || 0,
            additionalHourRate: additionalHourRate || 0,
            capacity: capacity || {},
            amenities: amenities || [],
            priceSettings: priceSettings || {}
        });

        await roomCategory.save();

        // Auto-create PriceConfig linked to this category
        const priceConfigData = {
            hotelId: roomCategory.hotelId,
            roomTypeId: roomCategory.name, // Use category name as roomTypeId for backward compatibility
            roomCategoryId: roomCategory._id,
            hourlyRates: {
                firstHourPrice: roomCategory.firstHourRate || roomCategory.pricing?.hourly || 0,
                additionalHourPrice: roomCategory.additionalHourRate || 0,
                maxHoursBeforeDay: roomCategory.priceSettings?.autoDailyHours || 6,
                gracePeriodMinutes: roomCategory.priceSettings?.gracePeriodMinutes || 15,
                autoNightlyHours: roomCategory.priceSettings?.autoNightlyHours || 8
            },
            dailyRates: {
                standardPrice: roomCategory.pricing?.daily || 0,
                checkInTime: roomCategory.priceSettings?.dailyStartTime || '12:00',
                checkOutTime: roomCategory.priceSettings?.dailyEndTime || '12:00',
                earlyCheckinSurcharge: roomCategory.priceSettings?.dailyEarlyCheckinSurcharge || 0,
                latecheckOutFee: roomCategory.priceSettings?.dailyLateCheckoutFee || 0
            },
            nightlyRates: {
                standardPrice: roomCategory.pricing?.nightly || 0,
                startTime: roomCategory.priceSettings?.nightlyStartTime || '20:00',
                endTime: roomCategory.priceSettings?.nightlyEndTime || '12:00',
                earlyCheckinSurcharge: roomCategory.priceSettings?.nightlyEarlyCheckinSurcharge || 0,
                lateCheckoutSurcharge: roomCategory.priceSettings?.nightlyLateCheckoutSurcharge || 0,
                autoDailyHours: roomCategory.priceSettings?.autoDailyHours || 24
            },
            isActive: true
        };
        try {
            const newPriceConfig = new PriceConfig(priceConfigData);
            await newPriceConfig.save();
        } catch (pcErr) {
            console.error('Error auto-creating PriceConfig for category:', pcErr);
        }

        res.status(201).json({
            message: 'Tạo loại phòng thành công',
            data: roomCategory
        });

    } catch (error) {
        console.error('Error creating room category:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tạo loại phòng', 
            error: error.message 
        });
    }
};

/**
 * Lấy danh sách loại phòng theo hotelId
 * GET /api/room-categories?hotelId=xxx
 */
exports.getAll = async (req, res) => {
    try {
        const { hotelId } = req.query;

        if (!hotelId) {
            return res.status(400).json({ 
                message: 'hotelId là bắt buộc' 
            });
        }

        const roomCategories = await RoomCategory.find({
            hotelId: new mongoose.Types.ObjectId(hotelId)
        }).sort({ createdAt: -1 });

        res.status(200).json({
            message: 'Lấy danh sách loại phòng thành công',
            data: roomCategories
        });

    } catch (error) {
        console.error('Error getting room categories:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy danh sách loại phòng', 
            error: error.message 
        });
    }
};

/**
 * Lấy loại phòng theo ID
 * GET /api/room-categories/:id
 */
exports.getById = async (req, res) => {
    try {
        const { id } = req.params;

        const roomCategory = await RoomCategory.findById(id);

        if (!roomCategory) {
            return res.status(404).json({ 
                message: 'Không tìm thấy loại phòng' 
            });
        }

        res.status(200).json({
            message: 'Lấy loại phòng thành công',
            data: roomCategory
        });

    } catch (error) {
        console.error('Error getting room category:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy loại phòng', 
            error: error.message 
        });
    }
};

/**
 * Cập nhật loại phòng
 * PUT /api/room-categories/:id
 */
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const roomCategory = await RoomCategory.findById(id);

        if (!roomCategory) {
            return res.status(404).json({ 
                message: 'Không tìm thấy loại phòng' 
            });
        }

        // Cập nhật các trường được gửi lên
        const allowedFields = ['name', 'description', 'pricing', 'firstHourRate', 'additionalHourRate', 'capacity', 'amenities', 'priceSettings'];
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                roomCategory[field] = updateData[field];
            }
        });

        await roomCategory.save();

        // Sync PriceConfig linked to this category
        try {
            let linkedConfig = await PriceConfig.findOne({ roomCategoryId: roomCategory._id, isActive: true });
            if (linkedConfig) {
                // Update existing PriceConfig
                linkedConfig.roomTypeId = roomCategory.name;
                linkedConfig.hourlyRates = {
                    firstHourPrice: roomCategory.firstHourRate || roomCategory.pricing?.hourly || 0,
                    additionalHourPrice: roomCategory.additionalHourRate || 0,
                    maxHoursBeforeDay: roomCategory.priceSettings?.autoDailyHours || linkedConfig.hourlyRates?.maxHoursBeforeDay || 6,
                    gracePeriodMinutes: roomCategory.priceSettings?.gracePeriodMinutes || linkedConfig.hourlyRates?.gracePeriodMinutes || 15,
                    autoNightlyHours: roomCategory.priceSettings?.autoNightlyHours || linkedConfig.hourlyRates?.autoNightlyHours || 8
                };
                linkedConfig.dailyRates = {
                    standardPrice: roomCategory.pricing?.daily || 0,
                    checkInTime: roomCategory.priceSettings?.dailyStartTime || linkedConfig.dailyRates?.checkInTime || '12:00',
                    checkOutTime: roomCategory.priceSettings?.dailyEndTime || linkedConfig.dailyRates?.checkOutTime || '12:00',
                    earlyCheckinSurcharge: roomCategory.priceSettings?.dailyEarlyCheckinSurcharge || 0,
                    latecheckOutFee: roomCategory.priceSettings?.dailyLateCheckoutFee || 0
                };
                linkedConfig.nightlyRates = {
                    standardPrice: roomCategory.pricing?.nightly || 0,
                    startTime: roomCategory.priceSettings?.nightlyStartTime || linkedConfig.nightlyRates?.startTime || '20:00',
                    endTime: roomCategory.priceSettings?.nightlyEndTime || linkedConfig.nightlyRates?.endTime || '12:00',
                    earlyCheckinSurcharge: roomCategory.priceSettings?.nightlyEarlyCheckinSurcharge || 0,
                    lateCheckoutSurcharge: roomCategory.priceSettings?.nightlyLateCheckoutSurcharge || 0,
                    autoDailyHours: roomCategory.priceSettings?.autoDailyHours || linkedConfig.nightlyRates?.autoDailyHours || 24
                };
                await linkedConfig.save();
            }
            
            // Also update all rooms with this roomCategoryId
            const rooms = await Room.find({ roomCategoryId: roomCategory._id });
            for (const room of rooms) {
                room.pricing = {
                    hourly: roomCategory.pricing?.hourly || 0,
                    daily: roomCategory.pricing?.daily || 0,
                    nightly: roomCategory.pricing?.nightly || 0,
                    weekly: roomCategory.pricing?.weekly || 0,
                    monthly: roomCategory.pricing?.monthly || 0,
                    currency: roomCategory.pricing?.currency || 'VND'
                };
                room.firstHourRate = roomCategory.firstHourRate || roomCategory.pricing?.hourly || 0;
                room.additionalHourRate = roomCategory.additionalHourRate || 0;
                if (room.priceSettings) {
                    room.priceSettings = {
                        ...room.priceSettings,
                        nightlyStartTime: roomCategory.priceSettings?.nightlyStartTime || room.priceSettings.nightlyStartTime,
                        nightlyEndTime: roomCategory.priceSettings?.nightlyEndTime || room.priceSettings.nightlyEndTime,
                        dailyStartTime: roomCategory.priceSettings?.dailyStartTime || room.priceSettings.dailyStartTime,
                        dailyEndTime: roomCategory.priceSettings?.dailyEndTime || room.priceSettings.dailyEndTime,
                        autoNightlyHours: roomCategory.priceSettings?.autoNightlyHours || room.priceSettings.autoNightlyHours,
                        gracePeriodMinutes: roomCategory.priceSettings?.gracePeriodMinutes || room.priceSettings.gracePeriodMinutes,
                        dailyEarlyCheckinSurcharge: roomCategory.priceSettings?.dailyEarlyCheckinSurcharge || 0,
                        dailyLateCheckoutFee: roomCategory.priceSettings?.dailyLateCheckoutFee || 0,
                        nightlyEarlyCheckinSurcharge: roomCategory.priceSettings?.nightlyEarlyCheckinSurcharge || 0,
                        nightlyLateCheckoutSurcharge: roomCategory.priceSettings?.nightlyLateCheckoutSurcharge || 0
                    };
                }
                if (linkedConfig) {
                    room.priceConfigId = linkedConfig._id;
                }
                await room.save();
            }
        } catch (pcErr) {
            console.error('Error syncing PriceConfig for category:', pcErr);
        }

        res.status(200).json({
            message: 'Cập nhật loại phòng thành công',
            data: roomCategory
        });

    } catch (error) {
        console.error('Error updating room category:', error);
        res.status(500).json({ 
            message: 'Lỗi khi cập nhật loại phòng', 
            error: error.message 
        });
    }
};

/**
 * Xóa loại phòng
 * DELETE /api/room-categories/:id
 */
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;

        const roomCategory = await RoomCategory.findById(id);

        if (!roomCategory) {
            return res.status(404).json({ 
                message: 'Không tìm thấy loại phòng' 
            });
        }

        // Kiểm tra xem có phòng nào đang tham chiếu đến loại phòng này không
        const roomCount = await Room.countDocuments({ roomCategoryId: id });
        if (roomCount > 0) {
            return res.status(400).json({ 
                message: `Không thể xóa loại phòng này vì có ${roomCount} phòng đang sử dụng` 
            });
        }

        await RoomCategory.findByIdAndDelete(id);

        res.status(200).json({
            message: 'Xóa loại phòng thành công'
        });

    } catch (error) {
        console.error('Error deleting room category:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xóa loại phòng', 
            error: error.message 
        });
    }
};
