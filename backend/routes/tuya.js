const express = require('express');
const router = express.Router();
const tuyaController = require('../controllers/tuyaController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess
} = require('../middlewares/auth');

// ============ TUYA SMART SWITCH ============

/**
 * Lấy danh sách thiết bị Tuya
 * GET /tuya/devices
 */
router.get(
    '/devices',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.getDevices
);

/**
 * Lấy thông tin một thiết bị
 * GET /tuya/devices/:deviceId
 */
router.get(
    '/devices/:deviceId',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.getDevice
);

/**
 * Lấy trạng thái thiết bị
 * GET /tuya/devices/:deviceId/status
 */
router.get(
    '/devices/:deviceId/status',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.getDeviceStatus
);

/**
 * Bật công tắc điện
 * POST /tuya/devices/:deviceId/turn-on
 */
router.post(
    '/devices/:deviceId/turn-on',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.turnOn
);

/**
 * Tắt công tắc điện
 * POST /tuya/devices/:deviceId/turn-off
 */
router.post(
    '/devices/:deviceId/turn-off',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.turnOff
);

/**
 * Toggle công tắc điện
 * POST /tuya/devices/:deviceId/toggle
 */
router.post(
    '/devices/:deviceId/toggle',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.toggle
);

/**
 * Thêm thiết bị mới
 * POST /tuya/devices
 */
router.post(
    '/devices',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    tuyaController.addDevice
);

/**
 * Cập nhật thiết bị
 * PUT /tuya/devices/:deviceId
 */
router.put(
    '/devices/:deviceId',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    tuyaController.updateDevice
);

/**
 * Xóa thiết bị
 * DELETE /tuya/devices/:deviceId
 */
router.delete(
    '/devices/:deviceId',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business']),
    tuyaController.deleteDevice
);

/**
 * Tự động bật công tắc khi check-in
 * POST /tuya/rooms/:roomId/auto-turn-on
 */
router.post(
    '/rooms/:roomId/auto-turn-on',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.autoTurnOnOnCheckIn
);

/**
 * Tự động tắt công tắc khi check-out
 * POST /tuya/rooms/:roomId/auto-turn-off
 */
router.post(
    '/rooms/:roomId/auto-turn-off',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    tuyaController.autoTurnOffOnCheckOut
);

module.exports = router;

