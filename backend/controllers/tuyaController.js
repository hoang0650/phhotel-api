const { TuyaDevice } = require('../models/tuyaDevice');
const mongoose = require('mongoose');
const { getDeviceStatus, controlDevice, getDevicesList } = require('../utils/tuyaClient');

/**
 * Lấy danh sách thiết bị Tuya
 * GET /tuya/devices
 */
exports.getDevices = async (req, res) => {
    try {
        const { roomId, hotelId } = req.query;
        const query = {};
        
        if (roomId) {
            query.roomId = new mongoose.Types.ObjectId(roomId);
        }
        
        // Nếu có hotelId, filter theo hotelId trực tiếp
        if (hotelId) {
            query.hotelId = new mongoose.Types.ObjectId(hotelId);
        }
        
        // Nếu có roomId, filter theo roomId
        if (roomId) {
            query.roomId = new mongoose.Types.ObjectId(roomId);
        }

        const devices = await TuyaDevice.find(query)
            .populate('roomId', 'roomNumber type')
            .sort({ name: 1 });

        // Cập nhật trạng thái từ Tuya API
        const devicesWithStatus = await Promise.all(
            devices.map(async (device) => {
                try {
                    const status = await getDeviceStatusFromTuya(device.deviceId);
                    return {
                        id: device.deviceId,
                        name: device.name,
                        online: status.online || false,
                        state: status.state || false,
                        hotelId: device.hotelId?.toString(),
                        roomId: device.roomId?._id?.toString(),
                        roomNumber: device.roomId?.roomNumber
                    };
                } catch (error) {
                    console.error(`Error getting status for device ${device.deviceId}:`, error);
                    return {
                        id: device.deviceId,
                        name: device.name,
                        online: false,
                        state: false,
                        hotelId: device.hotelId?.toString(),
                        roomId: device.roomId?._id?.toString(),
                        roomNumber: device.roomId?.roomNumber
                    };
                }
            })
        );

        res.status(200).json({
            message: 'Lấy danh sách thiết bị thành công',
            data: devicesWithStatus
        });

    } catch (error) {
        console.error('Error getting devices:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy danh sách thiết bị', 
            error: error.message 
        });
    }
};

/**
 * Lấy thông tin một thiết bị
 * GET /tuya/devices/:deviceId
 */
exports.getDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const device = await TuyaDevice.findOne({ deviceId })
            .populate('roomId', 'roomNumber type');

        if (!device) {
            return res.status(404).json({ 
                message: 'Không tìm thấy thiết bị' 
            });
        }

        // Lấy trạng thái từ Tuya API
        const status = await getDeviceStatusFromTuya(deviceId);

        res.status(200).json({
            message: 'Lấy thông tin thiết bị thành công',
            data: {
                id: device.deviceId,
                name: device.name,
                online: status.online || false,
                state: status.state || false,
                hotelId: device.hotelId?.toString(),
                roomId: device.roomId?._id?.toString(),
                roomNumber: device.roomId?.roomNumber
            }
        });

    } catch (error) {
        console.error('Error getting device:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy thông tin thiết bị', 
            error: error.message 
        });
    }
};

/**
 * Lấy trạng thái thiết bị
 * GET /tuya/devices/:deviceId/status
 */
exports.getDeviceStatus = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const status = await getDeviceStatusFromTuya(deviceId);

        res.status(200).json({
            message: 'Lấy trạng thái thiết bị thành công',
            data: status
        });

    } catch (error) {
        console.error('Error getting device status:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lấy trạng thái thiết bị', 
            error: error.message 
        });
    }
};

/**
 * Bật công tắc điện
 * POST /tuya/devices/:deviceId/turn-on
 */
exports.turnOn = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const result = await controlDeviceFromTuya(deviceId, true);

        res.status(200).json({
            success: result.success,
            message: result.message || 'Đã bật công tắc điện',
            data: {
                deviceId: deviceId,
                state: true,
                timestamp: Date.now()
            }
        });

    } catch (error) {
        console.error('Error turning on device:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi bật công tắc điện', 
            error: error.message 
        });
    }
};

/**
 * Tắt công tắc điện
 * POST /tuya/devices/:deviceId/turn-off
 */
exports.turnOff = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const result = await controlDeviceFromTuya(deviceId, false);

        res.status(200).json({
            success: result.success,
            message: result.message || 'Đã tắt công tắc điện',
            data: {
                deviceId: deviceId,
                state: false,
                timestamp: Date.now()
            }
        });

    } catch (error) {
        console.error('Error turning off device:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi tắt công tắc điện', 
            error: error.message 
        });
    }
};

/**
 * Toggle công tắc điện
 * POST /tuya/devices/:deviceId/toggle
 */
exports.toggle = async (req, res) => {
    try {
        const { deviceId } = req.params;

        // Lấy trạng thái hiện tại
        const currentStatus = await getDeviceStatusFromTuya(deviceId);
        const newState = !currentStatus.state;

        const result = await controlDeviceFromTuya(deviceId, newState);

        res.status(200).json({
            success: result.success,
            message: result.message || `Đã ${newState ? 'bật' : 'tắt'} công tắc điện`,
            data: {
                deviceId: deviceId,
                state: newState,
                timestamp: Date.now()
            }
        });

    } catch (error) {
        console.error('Error toggling device:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi khi chuyển đổi công tắc điện', 
            error: error.message 
        });
    }
};

/**
 * Thêm thiết bị mới
 * POST /tuya/devices
 */
exports.addDevice = async (req, res) => {
    try {
        const { deviceId, name, hotelId, roomId, roomNumber } = req.body;
        
        // Lấy hotelId từ body hoặc từ user context
        const finalHotelId = hotelId || req.user?.hotelId || req.user?.selectedHotelId;
        
        if (!deviceId || !name) {
            return res.status(400).json({ 
                message: 'deviceId và name là bắt buộc' 
            });
        }
        
        if (!finalHotelId) {
            return res.status(400).json({ 
                message: 'hotelId là bắt buộc' 
            });
        }

        // Kiểm tra thiết bị đã tồn tại chưa
        const existingDevice = await TuyaDevice.findOne({ deviceId });
        if (existingDevice) {
            return res.status(400).json({ 
                message: 'Thiết bị đã tồn tại' 
            });
        }

        const device = new TuyaDevice({
            deviceId,
            name,
            hotelId: new mongoose.Types.ObjectId(finalHotelId),
            roomId: roomId ? new mongoose.Types.ObjectId(roomId) : undefined,
            roomNumber
        });

        await device.save();

        res.status(201).json({
            message: 'Thêm thiết bị thành công',
            data: {
                id: device.deviceId,
                name: device.name,
                hotelId: device.hotelId?.toString(),
                roomId: device.roomId?.toString(),
                roomNumber: device.roomNumber
            }
        });

    } catch (error) {
        console.error('Error adding device:', error);
        res.status(500).json({ 
            message: 'Lỗi khi thêm thiết bị', 
            error: error.message 
        });
    }
};

/**
 * Cập nhật thiết bị
 * PUT /tuya/devices/:deviceId
 */
exports.updateDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { name, hotelId, roomId, roomNumber } = req.body;

        const device = await TuyaDevice.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ 
                message: 'Không tìm thấy thiết bị' 
            });
        }

        if (name) device.name = name;
        if (hotelId) device.hotelId = new mongoose.Types.ObjectId(hotelId);
        if (roomId) device.roomId = new mongoose.Types.ObjectId(roomId);
        if (roomNumber !== undefined) device.roomNumber = roomNumber;

        await device.save();

        res.status(200).json({
            message: 'Cập nhật thiết bị thành công',
            data: {
                id: device.deviceId,
                name: device.name,
                hotelId: device.hotelId?.toString(),
                roomId: device.roomId?.toString(),
                roomNumber: device.roomNumber
            }
        });

    } catch (error) {
        console.error('Error updating device:', error);
        res.status(500).json({ 
            message: 'Lỗi khi cập nhật thiết bị', 
            error: error.message 
        });
    }
};

/**
 * Xóa thiết bị
 * DELETE /tuya/devices/:deviceId
 */
exports.deleteDevice = async (req, res) => {
    try {
        const { deviceId } = req.params;

        const device = await TuyaDevice.findOneAndDelete({ deviceId });
        if (!device) {
            return res.status(404).json({ 
                message: 'Không tìm thấy thiết bị' 
            });
        }

        res.status(200).json({
            message: 'Xóa thiết bị thành công'
        });

    } catch (error) {
        console.error('Error deleting device:', error);
        res.status(500).json({ 
            message: 'Lỗi khi xóa thiết bị', 
            error: error.message 
        });
    }
};

// ============ HELPER FUNCTIONS ============

/**
 * Lấy trạng thái thiết bị từ Tuya API
 * Sử dụng tuyaClient utility
 */
async function getDeviceStatusFromTuya(deviceId) {
    return await getDeviceStatus(deviceId);
}

/**
 * Điều khiển thiết bị (bật/tắt)
 * Sử dụng tuyaClient utility
 */
async function controlDeviceFromTuya(deviceId, state) {
    return await controlDevice(deviceId, state);
}

/**
 * Tự động bật công tắc khi check-in
 * POST /tuya/rooms/:roomId/auto-turn-on
 */
exports.autoTurnOnOnCheckIn = async (req, res) => {
    try {
        const { roomId } = req.params;

        // Tìm tất cả thiết bị của phòng
        const devices = await TuyaDevice.find({ 
            roomId: new mongoose.Types.ObjectId(roomId) 
        });

        if (devices.length === 0) {
            return res.status(200).json({
                message: 'Phòng này không có công tắc điện',
                data: { devicesControlled: 0 }
            });
        }

        // Bật tất cả công tắc của phòng
        const results = await Promise.allSettled(
            devices.map(async (device) => {
                const result = await controlDeviceFromTuya(device.deviceId, true);
                return {
                    deviceId: device.deviceId,
                    deviceName: device.name,
                    success: result.success,
                    message: result.message
                };
            })
        );

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failedCount = results.length - successCount;

        res.status(200).json({
            message: `Đã bật ${successCount}/${devices.length} công tắc điện`,
            data: {
                devicesControlled: successCount,
                totalDevices: devices.length,
                results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, message: 'Lỗi' })
            }
        });

    } catch (error) {
        console.error('Error auto turning on devices on check-in:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tự động bật công tắc', 
            error: error.message 
        });
    }
};

/**
 * Tự động tắt công tắc khi check-out
 * POST /tuya/rooms/:roomId/auto-turn-off
 */
exports.autoTurnOffOnCheckOut = async (req, res) => {
    try {
        const { roomId } = req.params;

        // Tìm tất cả thiết bị của phòng
        const devices = await TuyaDevice.find({ 
            roomId: new mongoose.Types.ObjectId(roomId) 
        });

        if (devices.length === 0) {
            return res.status(200).json({
                message: 'Phòng này không có công tắc điện',
                data: { devicesControlled: 0 }
            });
        }

        // Tắt tất cả công tắc của phòng
        const results = await Promise.allSettled(
            devices.map(async (device) => {
                const result = await controlDeviceFromTuya(device.deviceId, false);
                return {
                    deviceId: device.deviceId,
                    deviceName: device.name,
                    success: result.success,
                    message: result.message
                };
            })
        );

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failedCount = results.length - successCount;

        res.status(200).json({
            message: `Đã tắt ${successCount}/${devices.length} công tắc điện để tiết kiệm điện`,
            data: {
                devicesControlled: successCount,
                totalDevices: devices.length,
                results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, message: 'Lỗi' })
            }
        });

    } catch (error) {
        console.error('Error auto turning off devices on check-out:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tự động tắt công tắc', 
            error: error.message 
        });
    }
};

