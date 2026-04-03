const express = require('express');
const router = express.Router();
const otaIntegrationsController = require('../controllers/otaIntegrationsController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeHotelAccess 
} = require('../middlewares/auth');

// ============ CRUD OTA INTEGRATIONS ============
router.route('/')
    .get(
        authenticateToken,
        authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
        authorizeHotelAccess,
        otaIntegrationsController.getAllOtaIntegrations
    )
    .post(
        authenticateToken,
        authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
        authorizeHotelAccess,
        otaIntegrationsController.createOtaIntegration
    );

router.route('/:id')
    .get(
        authenticateToken,
        authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
        authorizeHotelAccess,
        otaIntegrationsController.getOtaIntegrationById
    )
    .put(
        authenticateToken,
        authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
        authorizeHotelAccess,
        otaIntegrationsController.updateOtaIntegration
    )
    .delete(
        authenticateToken,
        authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
        authorizeHotelAccess,
        otaIntegrationsController.deleteOtaIntegration
    );

// ============ OTA LOGIN & SYNC ============
router.post(
    '/:id/login',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    otaIntegrationsController.loginOtaProvider
);

router.post(
    '/:id/sync',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    otaIntegrationsController.syncOtaData
);

// ============ API RIÊNG TỪNG TRANG OTA ============

// Booking.com - Lấy danh sách đặt phòng
router.get(
    '/bookingcom/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getBookingComBookings
);

// Agoda - Lấy danh sách đặt phòng
router.get(
    '/agoda/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getAgodaBookings
);

// Traveloka - Lấy danh sách đặt phòng
router.get(
    '/traveloka/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getTravelokaBookings
);

// Trip.com - Lấy danh sách đặt phòng
router.get(
    '/tripcom/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getTripComBookings
);

// Expedia - Lấy danh sách đặt phòng
router.get(
    '/expedia/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getExpediaBookings
);

// ============ OTA BOOKINGS - CHO CALENDAR ============

// Lấy tất cả OTA bookings để hiển thị trên calendar
router.get(
    '/bookings/calendar',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getAllOtaBookingsForCalendar
);

// Lấy chi tiết một OTA booking
router.get(
    '/bookings/:id',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.getOtaBookingById
);

// Assign OTA booking vào phòng cụ thể
router.post(
    '/bookings/:otaBookingId/assign',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel', 'staff']),
    authorizeHotelAccess,
    otaIntegrationsController.assignOtaBookingToRoom
);

// ============ INVENTORY & AVAILABILITY SYNC ============

// Đồng bộ inventory lên một OTA provider cụ thể
router.post(
    '/:id/sync-inventory',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    otaIntegrationsController.syncInventoryToOta
);

// Đồng bộ inventory cho tất cả OTA của một hotel
router.post(
    '/hotel/:hotelId/sync-all-inventory',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    otaIntegrationsController.syncAllInventoryForHotel
);

// ============ LEGACY - Lấy bookings từ integration (deprecated) ============
router.get(
    '/:id/bookings',
    authenticateToken,
    authorizeRoles(['superadmin', 'admin', 'business', 'hotel']),
    authorizeHotelAccess,
    otaIntegrationsController.getOtaBookings
);

module.exports = router;
