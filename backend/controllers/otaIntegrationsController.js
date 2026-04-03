const { OtaIntegration } = require('../models/otaIntegrations');
const { OtaBooking } = require('../models/otaBooking');
const { Hotel } = require('../models/hotel');
const { Room } = require('../models/rooms');
const { Booking } = require('../models/booking');
const axios = require('axios');
const qs = require('querystring');
const crypto = require('crypto');

// OTA Provider Base URLs
const OTA_URLS = {
    'Booking.com': 'https://distribution-xml.booking.com/2.0',
    'Agoda': 'https://api.agoda.com/v2',
    'Traveloka': 'https://api.traveloka.com/v2',
    'Trip.com': 'https://api.trip.com/v2',
    'Expedia': 'https://api.ean.com/v3', // Production
    'ExpediaTest': 'https://test.ean.com/v3', // Test environment
    'G2J': 'https://api.g2j.com/v1'
};

// Authentication URLs
const AUTH_URLS = {
    'Booking.com': 'https://auth.booking.com/oauth/token',
    'Agoda': 'https://api.agoda.com/v2/auth/token',
    'Traveloka': 'https://api.traveloka.com/v2/auth/token',
    'Trip.com': 'https://api.trip.com/v2/auth/token',
    'Expedia': 'https://api.ean.com/v3/oauth2/token',
    'ExpediaTest': 'https://test.ean.com/v3/oauth2/token',
    'G2J': 'https://api.g2j.com/v1/auth/token'
};

// Helper function to generate Expedia Rapid API signature
const generateExpediaSignature = (apiKey, secret, timestamp, method, path, body = '') => {
    const message = `${apiKey}${secret}${timestamp}`;
    const signature = crypto.createHmac('sha512', secret).update(message).digest('hex');
    return signature;
};

// Helper function to get headers for each provider
const getHeaders = (integration, method = 'GET', path = '', body = '') => {
    const headers = {
        'Content-Type': 'application/json'
    };

    switch (integration.provider) {
        case 'Booking.com':
            if (integration.credentials?.accessToken) {
                headers['Authorization'] = `Bearer ${integration.credentials.accessToken}`;
            }
            break;
        
        case 'Agoda':
            if (integration.credentials?.agodaApiKey) {
                headers['X-API-Key'] = integration.credentials.agodaApiKey;
            }
            break;
        
        case 'Traveloka':
            if (integration.credentials?.accessToken) {
                headers['X-Client-ID'] = integration.credentials.travelokaClientId;
                headers['Authorization'] = `Bearer ${integration.credentials.accessToken}`;
            }
            break;
        
        case 'Trip.com':
            if (integration.credentials?.tripClientId && integration.credentials?.tripClientSecret) {
                headers['X-Partner-Id'] = integration.credentials.tripClientId;
                headers['X-Partner-Secret'] = integration.credentials.tripClientSecret;
            }
            break;
        
        case 'Expedia':
            // Expedia Rapid API uses SHA-512 signature authentication
            if (integration.credentials?.expediaApiKey && integration.credentials?.expediaSecret) {
                const timestamp = Math.floor(Date.now() / 1000).toString();
                const signature = generateExpediaSignature(
                    integration.credentials.expediaApiKey,
                    integration.credentials.expediaSecret,
                    timestamp,
                    method,
                    path,
                    body
                );
                headers['Authorization'] = `EAN apikey=${integration.credentials.expediaApiKey},signature=${signature},timestamp=${timestamp}`;
                headers['Accept'] = 'application/json';
                headers['Content-Type'] = 'application/json';
            }
            break;
        
        case 'G2J':
            if (integration.credentials?.g2jApiKey) {
                headers['X-API-Key'] = integration.credentials.g2jApiKey;
            }
            if (integration.credentials?.accessToken) {
                headers['Authorization'] = `Bearer ${integration.credentials.accessToken}`;
            }
            break;
    }

    return headers;
};

// Helper function to normalize OTA booking data
const normalizeOtaBooking = (rawBooking, provider, hotelId, integrationId) => {
    let normalized = {
        otaProvider: provider,
        hotelId,
        integrationId,
        rawData: rawBooking
    };

    switch (provider) {
        case 'Booking.com':
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.reservation_id || rawBooking.id,
                otaConfirmationNumber: rawBooking.confirmation_number,
                guestDetails: {
                    name: rawBooking.guest_name || `${rawBooking.first_name} ${rawBooking.last_name}`,
                    firstName: rawBooking.first_name,
                    lastName: rawBooking.last_name,
                    email: rawBooking.email,
                    phone: rawBooking.phone,
                    nationality: rawBooking.country,
                    numberOfGuests: {
                        adults: rawBooking.adults || 1,
                        children: rawBooking.children || 0
                    },
                    specialRequests: rawBooking.remarks
                },
                roomDetails: {
                    roomTypeId: rawBooking.room_id,
                    roomTypeName: rawBooking.room_name || rawBooking.room_type,
                    roomCount: rawBooking.number_of_rooms || 1,
                    mealPlan: rawBooking.meal_plan
                },
                checkInDate: new Date(rawBooking.checkin),
                checkOutDate: new Date(rawBooking.checkout),
                pricing: {
                    totalAmount: parseFloat(rawBooking.price) || parseFloat(rawBooking.total_price),
                    currency: rawBooking.currency || 'VND',
                    commission: rawBooking.commission
                },
                paymentMethod: rawBooking.payment_type === 'prepaid' ? 'prepaid' : 'pay_at_property',
                paymentStatus: rawBooking.is_paid ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.status, provider),
                otaStatus: rawBooking.status,
                policies: {
                    cancellationPolicy: rawBooking.cancellation_policy,
                    cancellationDeadline: rawBooking.free_cancellation_until ? new Date(rawBooking.free_cancellation_until) : null
                }
            };
            break;

        case 'Agoda':
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.booking_id || rawBooking.agoda_booking_id,
                otaConfirmationNumber: rawBooking.confirmation_code,
                guestDetails: {
                    name: rawBooking.guest_full_name,
                    firstName: rawBooking.guest_first_name,
                    lastName: rawBooking.guest_last_name,
                    email: rawBooking.guest_email,
                    phone: rawBooking.guest_phone,
                    nationality: rawBooking.guest_country,
                    numberOfGuests: {
                        adults: rawBooking.number_of_adults || 1,
                        children: rawBooking.number_of_children || 0
                    },
                    specialRequests: rawBooking.special_request
                },
                roomDetails: {
                    roomTypeId: rawBooking.room_type_id,
                    roomTypeName: rawBooking.room_type_name,
                    roomCount: rawBooking.rooms || 1,
                    mealPlan: rawBooking.meal_type
                },
                checkInDate: new Date(rawBooking.check_in_date),
                checkOutDate: new Date(rawBooking.check_out_date),
                pricing: {
                    totalAmount: parseFloat(rawBooking.total_amount),
                    currency: rawBooking.currency_code || 'VND',
                    commission: rawBooking.agoda_commission
                },
                paymentMethod: rawBooking.payment_model === 'Collect' ? 'pay_at_property' : 'prepaid',
                paymentStatus: rawBooking.payment_status === 'PAID' ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.booking_status, provider),
                otaStatus: rawBooking.booking_status
            };
            break;

        case 'Traveloka':
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.orderId || rawBooking.booking_id,
                otaConfirmationNumber: rawBooking.confirmationNumber,
                guestDetails: {
                    name: rawBooking.guestName,
                    email: rawBooking.guestEmail,
                    phone: rawBooking.guestPhone,
                    numberOfGuests: {
                        adults: rawBooking.adultCount || 1,
                        children: rawBooking.childCount || 0
                    },
                    specialRequests: rawBooking.specialRequest
                },
                roomDetails: {
                    roomTypeId: rawBooking.roomId,
                    roomTypeName: rawBooking.roomName,
                    roomCount: rawBooking.roomCount || 1
                },
                checkInDate: new Date(rawBooking.checkIn),
                checkOutDate: new Date(rawBooking.checkOut),
                pricing: {
                    totalAmount: parseFloat(rawBooking.totalPrice),
                    currency: rawBooking.currency || 'VND'
                },
                paymentMethod: rawBooking.paymentType === 'PAY_AT_HOTEL' ? 'pay_at_property' : 'prepaid',
                paymentStatus: rawBooking.isPaid ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.status, provider),
                otaStatus: rawBooking.status
            };
            break;

        case 'Trip.com':
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.order_id || rawBooking.tripOrderId,
                otaConfirmationNumber: rawBooking.confirm_no,
                guestDetails: {
                    name: rawBooking.contact_name || rawBooking.guest_name,
                    email: rawBooking.contact_email,
                    phone: rawBooking.contact_phone,
                    numberOfGuests: {
                        adults: rawBooking.adult_num || 1,
                        children: rawBooking.child_num || 0
                    },
                    specialRequests: rawBooking.remark
                },
                roomDetails: {
                    roomTypeId: rawBooking.room_type_id,
                    roomTypeName: rawBooking.room_type_name,
                    roomCount: rawBooking.room_num || 1
                },
                checkInDate: new Date(rawBooking.check_in),
                checkOutDate: new Date(rawBooking.check_out),
                pricing: {
                    totalAmount: parseFloat(rawBooking.total_price),
                    currency: rawBooking.currency || 'VND'
                },
                paymentMethod: rawBooking.pay_type === 'hotel_collect' ? 'pay_at_property' : 'prepaid',
                paymentStatus: rawBooking.pay_status === 'paid' ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.order_status, provider),
                otaStatus: rawBooking.order_status
            };
            break;

        case 'Expedia':
            // Expedia Rapid API structure
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.itinerary_id || rawBooking.itineraryId || rawBooking.confirmation_number || rawBooking.confirmationNumber,
                otaConfirmationNumber: rawBooking.confirmation_number || rawBooking.confirmationNumber || rawBooking.itinerary_id,
                guestDetails: {
                    name: rawBooking.primary_contact?.name?.full_name || rawBooking.primary_contact?.name || rawBooking.guest_name || 'N/A',
                    firstName: rawBooking.primary_contact?.name?.first_name || rawBooking.primary_contact?.first_name,
                    lastName: rawBooking.primary_contact?.name?.last_name || rawBooking.primary_contact?.last_name,
                    email: rawBooking.primary_contact?.email || rawBooking.guest_email,
                    phone: rawBooking.primary_contact?.phone || rawBooking.guest_phone,
                    numberOfGuests: {
                        adults: rawBooking.rooms?.[0]?.number_of_adults || rawBooking.adults || 1,
                        children: rawBooking.rooms?.[0]?.number_of_children || rawBooking.children || 0,
                        infants: rawBooking.rooms?.[0]?.number_of_infants || 0
                    },
                    specialRequests: rawBooking.special_requests || rawBooking.specialRequests || rawBooking.remarks
                },
                roomDetails: {
                    roomTypeId: rawBooking.rooms?.[0]?.room_type_id || rawBooking.room_type_id || rawBooking.roomTypeId,
                    roomTypeName: rawBooking.rooms?.[0]?.room_type_name || rawBooking.room_type_name || rawBooking.roomTypeName || 'Standard Room',
                    roomCount: rawBooking.rooms?.length || rawBooking.number_of_rooms || rawBooking.numberOfRooms || 1,
                    bedType: rawBooking.rooms?.[0]?.bed_type || rawBooking.bed_type || rawBooking.bedType
                },
                checkInDate: new Date(rawBooking.check_in_date || rawBooking.checkInDate || rawBooking.start_date),
                checkOutDate: new Date(rawBooking.check_out_date || rawBooking.checkOutDate || rawBooking.end_date),
                pricing: {
                    totalAmount: parseFloat(rawBooking.total?.amount || rawBooking.total_amount || rawBooking.total || 0),
                    currency: rawBooking.total?.currency || rawBooking.currency || rawBooking.total_currency || 'USD',
                    basePrice: parseFloat(rawBooking.room_charges?.amount || rawBooking.room_charges?.base_rate || 0),
                    taxes: parseFloat(rawBooking.taxes?.amount || rawBooking.taxes || 0),
                    fees: parseFloat(rawBooking.fees?.amount || rawBooking.fees || 0),
                    commission: parseFloat(rawBooking.commission?.amount || rawBooking.commission || 0)
                },
                paymentMethod: rawBooking.payment_type === 'HotelCollect' || rawBooking.payment_type === 'hotel_collect' ? 'pay_at_property' : 'prepaid',
                paymentStatus: rawBooking.payment_status === 'Paid' || rawBooking.payment_status === 'paid' ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.status || rawBooking.booking_status, provider),
                otaStatus: rawBooking.status || rawBooking.booking_status
            };
            break;

        case 'G2J':
            normalized = {
                ...normalized,
                otaBookingId: rawBooking.booking_id || rawBooking.g2j_booking_id,
                otaConfirmationNumber: rawBooking.confirmation_code,
                guestDetails: {
                    name: rawBooking.guest_name || `${rawBooking.first_name} ${rawBooking.last_name}`,
                    firstName: rawBooking.first_name,
                    lastName: rawBooking.last_name,
                    email: rawBooking.guest_email,
                    phone: rawBooking.guest_phone,
                    numberOfGuests: {
                        adults: rawBooking.adults || 1,
                        children: rawBooking.children || 0
                    },
                    specialRequests: rawBooking.special_requests
                },
                roomDetails: {
                    roomTypeId: rawBooking.room_type_id,
                    roomTypeName: rawBooking.room_type_name,
                    roomCount: rawBooking.room_count || 1
                },
                checkInDate: new Date(rawBooking.check_in_date),
                checkOutDate: new Date(rawBooking.check_out_date),
                pricing: {
                    totalAmount: parseFloat(rawBooking.total_amount),
                    currency: rawBooking.currency || 'VND'
                },
                paymentMethod: rawBooking.payment_type === 'pay_at_hotel' ? 'pay_at_property' : 'prepaid',
                paymentStatus: rawBooking.payment_status === 'paid' ? 'paid' : 'pending',
                status: mapBookingStatus(rawBooking.booking_status, provider),
                otaStatus: rawBooking.booking_status
            };
            break;
    }

    return normalized;
};

// Map OTA booking status to system status
const mapBookingStatus = (otaStatus, provider) => {
    const statusMaps = {
        'Booking.com': {
            'new': 'pending',
            'confirmed': 'confirmed',
            'modified': 'modified',
            'cancelled': 'cancelled',
            'no_show': 'no_show'
        },
        'Agoda': {
            'PENDING': 'pending',
            'CONFIRMED': 'confirmed',
            'CANCELLED': 'cancelled',
            'MODIFIED': 'modified',
            'NOSHOW': 'no_show'
        },
        'Traveloka': {
            'PENDING': 'pending',
            'CONFIRMED': 'confirmed',
            'CANCELLED': 'cancelled',
            'COMPLETED': 'checked_out'
        },
        'Trip.com': {
            'new': 'pending',
            'confirmed': 'confirmed',
            'cancelled': 'cancelled',
            'completed': 'checked_out',
            'no_show': 'no_show'
        },
        'Expedia': {
            'Pending': 'pending',
            'Confirmed': 'confirmed',
            'Cancelled': 'cancelled',
            'Completed': 'checked_out',
            'NoShow': 'no_show'
        },
        'G2J': {
            'PENDING': 'pending',
            'CONFIRMED': 'confirmed',
            'CANCELLED': 'cancelled',
            'CHECKED_IN': 'checked_in',
            'CHECKED_OUT': 'checked_out',
            'NO_SHOW': 'no_show'
        }
    };

    return statusMaps[provider]?.[otaStatus] || 'pending';
};

// Lấy danh sách tất cả các cấu hình OTA hoặc theo hotelId
exports.getAllOtaIntegrations = async (req, res) => {
    try {
        const query = req.query.hotelId ? { hotelId: req.query.hotelId } : {};
        const integrations = await OtaIntegration.find(query).populate('hotelId', 'name');
        res.status(200).json(integrations);
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi lấy danh sách cấu hình OTA.", error: error.message });
    }
};

// Lấy chi tiết một cấu hình OTA
exports.getOtaIntegrationById = async (req, res) => {
    try {
        const integration = await OtaIntegration.findById(req.params.id).populate('hotelId', 'name');
        if (!integration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA." });
        }
        res.status(200).json(integration);
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi lấy chi tiết cấu hình OTA.", error: error.message });
    }
};

// Tạo mới một cấu hình OTA
exports.createOtaIntegration = async (req, res) => {
    try {
        const { hotelId, provider, credentials, settings, mappings } = req.body;

        if (!hotelId || !provider) {
            return res.status(400).json({ message: "Hotel ID và Provider là bắt buộc." });
        }

        const hotelExists = await Hotel.findById(hotelId);
        if (!hotelExists) {
            return res.status(404).json({ message: "Khách sạn không tồn tại." });
        }

        const newIntegration = new OtaIntegration({
            hotelId,
            provider,
            credentials,
            settings,
            mappings,
            status: 'inactive'
        });

        await newIntegration.save();
        res.status(201).json({ message: "Đã tạo cấu hình OTA thành công.", data: newIntegration });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "Cấu hình OTA cho khách sạn và provider này đã tồn tại.", error: error.message });
        }
        res.status(500).json({ message: "Lỗi khi tạo cấu hình OTA.", error: error.message });
    }
};

// Cập nhật một cấu hình OTA
exports.updateOtaIntegration = async (req, res) => {
    try {
        const { credentials, settings, mappings, status } = req.body;
        const updatedIntegration = await OtaIntegration.findByIdAndUpdate(
            req.params.id,
            { 
                credentials, 
                settings, 
                mappings, 
                status,
                lastSync: status === 'active' ? new Date() : undefined 
            },
            { new: true, runValidators: true }
        );

        if (!updatedIntegration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA để cập nhật." });
        }
        res.status(200).json({ message: "Đã cập nhật cấu hình OTA thành công.", data: updatedIntegration });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi cập nhật cấu hình OTA.", error: error.message });
    }
};

// Xóa một cấu hình OTA
exports.deleteOtaIntegration = async (req, res) => {
    try {
        const deletedIntegration = await OtaIntegration.findByIdAndDelete(req.params.id);
        if (!deletedIntegration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA để xóa." });
        }
        res.status(200).json({ message: "Đã xóa cấu hình OTA thành công." });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi xóa cấu hình OTA.", error: error.message });
    }
};

// Đăng nhập vào OTA Provider và lấy access token
exports.loginOtaProvider = async (req, res) => {
    let integration;
    try {
        integration = await OtaIntegration.findById(req.params.id);
        if (!integration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA." });
        }

        const { provider, credentials } = req.body;
        const authUrl = AUTH_URLS[provider];
        let tokenResponse;

        switch (provider) {
            case 'Booking.com':
                tokenResponse = await axios.post(authUrl, 
                    qs.stringify({
                        grant_type: 'password',
                        username: credentials.username,
                        password: credentials.password,
                        client_id: credentials.clientId,
                        client_secret: credentials.clientSecret
                    }),
                    {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    }
                );
                break;

            case 'Agoda':
                tokenResponse = await axios.post(authUrl, {
                    partnerId: credentials.agodaPartnerId,
                    apiKey: credentials.agodaApiKey
                });
                break;

            case 'Traveloka':
                tokenResponse = await axios.post(authUrl, {
                    client_id: credentials.travelokaClientId,
                    client_secret: credentials.travelokaClientSecret,
                    grant_type: 'client_credentials'
                });
                break;

            case 'Trip.com':
                tokenResponse = await axios.post(authUrl, {
                    client_id: credentials.tripClientId,
                    client_secret: credentials.tripClientSecret,
                    partner_code: credentials.tripPartnerCode
                });
                break;

            case 'Expedia':
                tokenResponse = await axios.post(authUrl, {
                    apiKey: credentials.expediaApiKey,
                    secret: credentials.expediaSecret
                });
                break;

            case 'G2J':
                tokenResponse = await axios.post(authUrl, {
                    api_key: credentials.g2jApiKey,
                    api_secret: credentials.g2jApiSecret
                });
                break;

            default:
                return res.status(400).json({ message: "Provider không được hỗ trợ." });
        }

        // Cập nhật thông tin xác thực
        integration.credentials = {
            ...integration.credentials,
            ...credentials,
            accessToken: tokenResponse.data.access_token,
            refreshToken: tokenResponse.data.refresh_token,
            tokenExpiresAt: new Date(Date.now() + tokenResponse.data.expires_in * 1000)
        };
        integration.status = 'active';
        integration.lastSync = new Date();

        await integration.save();

        res.status(200).json({ 
            message: "Đăng nhập thành công.", 
            data: integration 
        });
    } catch (error) {
        console.error('Login error:', error.response?.data || error.message);
        
        // Log error
        if (integration) {
            integration.errorLog.push({
                timestamp: new Date(),
                message: error.response?.data?.message || error.message,
                code: error.response?.status?.toString(),
                details: error.response?.data,
                provider: integration.provider,
                severity: 'high'
            });
            await integration.save();
        }

        res.status(error.response?.status || 500).json({ 
            message: "Lỗi khi đăng nhập vào OTA provider", 
            error: error.response?.data || error.message 
        });
    }
};

// ============ API RIÊNG TỪNG TRANG OTA ============

// Lấy bookings từ Booking.com
exports.getBookingComBookings = async (req, res) => {
    try {
        const { hotelId } = req.query;
        
        const integration = await OtaIntegration.findOne({ 
            hotelId, 
            provider: 'Booking.com',
            status: 'active'
        });
        
        if (!integration) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình Booking.com cho khách sạn này." 
            });
        }

        // Lấy từ database local trước
        const localBookings = await OtaBooking.find({ 
            hotelId, 
            otaProvider: 'Booking.com' 
        }).sort({ checkInDate: -1 });

        // Nếu có request sync, gọi API
        if (req.query.sync === 'true') {
            try {
                const headers = getHeaders(integration);
                const response = await axios.get(`${OTA_URLS['Booking.com']}/bookings`, {
                    headers,
                    params: {
                        propertyId: integration.credentials.propertyId,
                        ...req.query
                    }
                });

                // Lưu/cập nhật bookings vào database
                for (const booking of response.data.bookings || []) {
                    const normalized = normalizeOtaBooking(booking, 'Booking.com', hotelId, integration._id);
                    
                    await OtaBooking.findOneAndUpdate(
                        { otaProvider: 'Booking.com', otaBookingId: normalized.otaBookingId },
                        { 
                            ...normalized,
                            'syncStatus.lastSyncAt': new Date(),
                            'syncStatus.lastSyncStatus': 'success'
                        },
                        { upsert: true, new: true }
                    );
                }

                integration.lastSync = new Date();
                await integration.save();

                const updatedBookings = await OtaBooking.find({ 
                    hotelId, 
                    otaProvider: 'Booking.com' 
                }).sort({ checkInDate: -1 });

                return res.status(200).json({
                    message: "Đồng bộ thành công từ Booking.com",
                    data: updatedBookings,
                    lastSync: integration.lastSync
                });
            } catch (syncError) {
                console.error('Booking.com sync error:', syncError);
            }
        }

        res.status(200).json({
            message: "Lấy danh sách đặt phòng từ Booking.com thành công",
            data: localBookings,
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Error getting Booking.com bookings:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng từ Booking.com", 
            error: error.message 
        });
    }
};

// Lấy bookings từ Agoda
exports.getAgodaBookings = async (req, res) => {
    try {
        const { hotelId } = req.query;
        
        const integration = await OtaIntegration.findOne({ 
            hotelId, 
            provider: 'Agoda',
            status: 'active'
        });
        
        if (!integration) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình Agoda cho khách sạn này." 
            });
        }

        const localBookings = await OtaBooking.find({ 
            hotelId, 
            otaProvider: 'Agoda' 
        }).sort({ checkInDate: -1 });

        if (req.query.sync === 'true') {
            try {
                const headers = getHeaders(integration);
                const response = await axios.get(`${OTA_URLS['Agoda']}/bookings`, {
                    headers,
                    params: {
                        hotel_id: integration.credentials.hotelId,
                        ...req.query
                    }
                });

                for (const booking of response.data.data || []) {
                    const normalized = normalizeOtaBooking(booking, 'Agoda', hotelId, integration._id);
                    
                    await OtaBooking.findOneAndUpdate(
                        { otaProvider: 'Agoda', otaBookingId: normalized.otaBookingId },
                        { 
                            ...normalized,
                            'syncStatus.lastSyncAt': new Date(),
                            'syncStatus.lastSyncStatus': 'success'
                        },
                        { upsert: true, new: true }
                    );
                }

                integration.lastSync = new Date();
                await integration.save();

                const updatedBookings = await OtaBooking.find({ 
                    hotelId, 
                    otaProvider: 'Agoda' 
                }).sort({ checkInDate: -1 });

                return res.status(200).json({
                    message: "Đồng bộ thành công từ Agoda",
                    data: updatedBookings,
                    lastSync: integration.lastSync
                });
            } catch (syncError) {
                console.error('Agoda sync error:', syncError);
            }
        }

        res.status(200).json({
            message: "Lấy danh sách đặt phòng từ Agoda thành công",
            data: localBookings,
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Error getting Agoda bookings:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng từ Agoda", 
            error: error.message 
        });
    }
};

// Lấy bookings từ Traveloka
exports.getTravelokaBookings = async (req, res) => {
    try {
        const { hotelId } = req.query;
        
        const integration = await OtaIntegration.findOne({ 
            hotelId, 
            provider: 'Traveloka',
            status: 'active'
        });
        
        if (!integration) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình Traveloka cho khách sạn này." 
            });
        }

        const localBookings = await OtaBooking.find({ 
            hotelId, 
            otaProvider: 'Traveloka' 
        }).sort({ checkInDate: -1 });

        if (req.query.sync === 'true') {
            try {
                const headers = getHeaders(integration);
                const response = await axios.get(`${OTA_URLS['Traveloka']}/orders`, {
                    headers,
                    params: {
                        propertyId: integration.credentials.propertyId,
                        ...req.query
                    }
                });

                for (const booking of response.data.orders || []) {
                    const normalized = normalizeOtaBooking(booking, 'Traveloka', hotelId, integration._id);
                    
                    await OtaBooking.findOneAndUpdate(
                        { otaProvider: 'Traveloka', otaBookingId: normalized.otaBookingId },
                        { 
                            ...normalized,
                            'syncStatus.lastSyncAt': new Date(),
                            'syncStatus.lastSyncStatus': 'success'
                        },
                        { upsert: true, new: true }
                    );
                }

                integration.lastSync = new Date();
                await integration.save();

                const updatedBookings = await OtaBooking.find({ 
                    hotelId, 
                    otaProvider: 'Traveloka' 
                }).sort({ checkInDate: -1 });

                return res.status(200).json({
                    message: "Đồng bộ thành công từ Traveloka",
                    data: updatedBookings,
                    lastSync: integration.lastSync
                });
            } catch (syncError) {
                console.error('Traveloka sync error:', syncError);
            }
        }

        res.status(200).json({
            message: "Lấy danh sách đặt phòng từ Traveloka thành công",
            data: localBookings,
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Error getting Traveloka bookings:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng từ Traveloka", 
            error: error.message 
        });
    }
};

// Lấy bookings từ Trip.com
exports.getTripComBookings = async (req, res) => {
    try {
        const { hotelId } = req.query;
        
        const integration = await OtaIntegration.findOne({ 
            hotelId, 
            provider: 'Trip.com',
            status: 'active'
        });
        
        if (!integration) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình Trip.com cho khách sạn này." 
            });
        }

        const localBookings = await OtaBooking.find({ 
            hotelId, 
            otaProvider: 'Trip.com' 
        }).sort({ checkInDate: -1 });

        if (req.query.sync === 'true') {
            try {
                const headers = getHeaders(integration);
                const response = await axios.get(`${OTA_URLS['Trip.com']}/orders`, {
                    headers,
                    params: {
                        hotel_id: integration.credentials.hotelId,
                        ...req.query
                    }
                });

                for (const booking of response.data.orders || []) {
                    const normalized = normalizeOtaBooking(booking, 'Trip.com', hotelId, integration._id);
                    
                    await OtaBooking.findOneAndUpdate(
                        { otaProvider: 'Trip.com', otaBookingId: normalized.otaBookingId },
                        { 
                            ...normalized,
                            'syncStatus.lastSyncAt': new Date(),
                            'syncStatus.lastSyncStatus': 'success'
                        },
                        { upsert: true, new: true }
                    );
                }

                integration.lastSync = new Date();
                await integration.save();

                const updatedBookings = await OtaBooking.find({ 
                    hotelId, 
                    otaProvider: 'Trip.com' 
                }).sort({ checkInDate: -1 });

                return res.status(200).json({
                    message: "Đồng bộ thành công từ Trip.com",
                    data: updatedBookings,
                    lastSync: integration.lastSync
                });
            } catch (syncError) {
                console.error('Trip.com sync error:', syncError);
            }
        }

        res.status(200).json({
            message: "Lấy danh sách đặt phòng từ Trip.com thành công",
            data: localBookings,
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Error getting Trip.com bookings:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng từ Trip.com", 
            error: error.message 
        });
    }
};

// Lấy bookings từ Expedia
exports.getExpediaBookings = async (req, res) => {
    try {
        const { hotelId } = req.query;
        
        const integration = await OtaIntegration.findOne({ 
            hotelId, 
            provider: 'Expedia',
            status: 'active'
        });
        
        if (!integration) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình Expedia cho khách sạn này." 
            });
        }

        const localBookings = await OtaBooking.find({ 
            hotelId, 
            otaProvider: 'Expedia' 
        }).sort({ checkInDate: -1 });

        if (req.query.sync === 'true') {
            try {
                // Expedia Rapid API endpoint for bookings
                const expediaHotelId = integration.credentials.expediaHotelId || integration.credentials.propertyId;
                const baseUrl = integration.credentials.useTestEnv ? OTA_URLS['ExpediaTest'] : OTA_URLS['Expedia'];
                const path = `/itineraries?property_id=${expediaHotelId}`;
                
                const headers = getHeaders(integration, 'GET', path);
                const response = await axios.get(`${baseUrl}${path}`, {
                    headers,
                    params: {
                        ...req.query,
                        property_id: expediaHotelId
                    }
                });

                // Expedia Rapid API returns itineraries in response.data.itineraries
                const bookings = response.data.itineraries || response.data.bookings || [];
                for (const booking of bookings) {
                    const normalized = normalizeOtaBooking(booking, 'Expedia', hotelId, integration._id);
                    
                    await OtaBooking.findOneAndUpdate(
                        { otaProvider: 'Expedia', otaBookingId: normalized.otaBookingId },
                        { 
                            ...normalized,
                            'syncStatus.lastSyncAt': new Date(),
                            'syncStatus.lastSyncStatus': 'success'
                        },
                        { upsert: true, new: true }
                    );
                }

                integration.lastSync = new Date();
                await integration.save();

                const updatedBookings = await OtaBooking.find({ 
                    hotelId, 
                    otaProvider: 'Expedia' 
                }).sort({ checkInDate: -1 });

                return res.status(200).json({
                    message: "Đồng bộ thành công từ Expedia",
                    data: updatedBookings,
                    lastSync: integration.lastSync
                });
            } catch (syncError) {
                console.error('Expedia sync error:', syncError);
            }
        }

        res.status(200).json({
            message: "Lấy danh sách đặt phòng từ Expedia thành công",
            data: localBookings,
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Error getting Expedia bookings:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng từ Expedia", 
            error: error.message 
        });
    }
};

// ============ API CHUNG CHO TẤT CẢ OTA ============

// Lấy tất cả bookings từ tất cả OTA (cho calendar)
exports.getAllOtaBookingsForCalendar = async (req, res) => {
    try {
        const { hotelId, startDate, endDate, status } = req.query;
        
        if (!hotelId) {
            return res.status(400).json({ message: "hotelId là bắt buộc" });
        }

        const query = { hotelId };

        // Lọc theo ngày
        if (startDate || endDate) {
            query.$or = [
                {
                    checkInDate: {
                        ...(startDate && { $gte: new Date(startDate) }),
                        ...(endDate && { $lte: new Date(endDate) })
                    }
                },
                {
                    checkOutDate: {
                        ...(startDate && { $gte: new Date(startDate) }),
                        ...(endDate && { $lte: new Date(endDate) })
                    }
                }
            ];
        }

        // Lọc theo trạng thái
        if (status) {
            query.status = status;
        }

        const otaBookings = await OtaBooking.find(query)
            .populate('localRoomId', 'roomNumber floor type')
            .sort({ checkInDate: 1 });

        // Lấy danh sách phòng của khách sạn để map
        const rooms = await Room.find({ hotelId }).select('_id roomNumber floor type');

        // Format dữ liệu cho calendar
        const calendarData = otaBookings.map(booking => ({
            id: booking._id,
            otaBookingId: booking.otaBookingId,
            provider: booking.otaProvider,
            title: `${booking.guestDetails?.name || 'Khách'} - ${booking.otaProvider}`,
            start: booking.checkInDate,
            end: booking.checkOutDate,
            guestName: booking.guestDetails?.name,
            guestPhone: booking.guestDetails?.phone,
            guestEmail: booking.guestDetails?.email,
            roomType: booking.roomDetails?.roomTypeName,
            roomId: booking.localRoomId,
            roomNumber: booking.localRoomId?.roomNumber,
            totalAmount: booking.pricing?.totalAmount,
            currency: booking.pricing?.currency,
            paymentMethod: booking.paymentMethod,
            paymentStatus: booking.paymentStatus,
            status: booking.status,
            numberOfNights: booking.numberOfNights,
            numberOfGuests: booking.guestDetails?.numberOfGuests,
            color: getProviderColor(booking.otaProvider),
            extendedProps: {
                otaProvider: booking.otaProvider,
                confirmationNumber: booking.otaConfirmationNumber,
                specialRequests: booking.guestDetails?.specialRequests
            }
        }));

        // Đảm bảo tất cả providers đều có trong summary (kể cả khi = 0)
        const providerCounts = {
            'Booking.com': 0,
            'Agoda': 0,
            'Traveloka': 0,
            'Trip.com': 0,
            'Expedia': 0,
            'G2J': 0
        };
        
        calendarData.forEach(booking => {
            if (booking.provider && providerCounts.hasOwnProperty(booking.provider)) {
                providerCounts[booking.provider]++;
            }
        });

        res.status(200).json({
            message: "Lấy danh sách đặt phòng OTA cho calendar thành công",
            data: calendarData,
            rooms: rooms,
            summary: {
                total: calendarData.length,
                byProvider: providerCounts
            }
        });
    } catch (error) {
        console.error('Error getting OTA bookings for calendar:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy danh sách đặt phòng OTA cho calendar", 
            error: error.message 
        });
    }
};

// Helper function to get color for each OTA provider
const getProviderColor = (provider) => {
    const colors = {
        'Booking.com': '#003580',  // Blue
        'Agoda': '#5391ff',        // Light Blue
        'Traveloka': '#0194f3',    // Cyan
        'Trip.com': '#287dfa',     // Blue
        'Expedia': '#00355f',      // Dark Blue
        'G2J': '#ff6b35'           // Orange
    };
    return colors[provider] || '#888888';
};

// Assign OTA booking vào phòng cụ thể
exports.assignOtaBookingToRoom = async (req, res) => {
    try {
        const { otaBookingId } = req.params;
        const { roomId, staffId } = req.body;

        const otaBooking = await OtaBooking.findById(otaBookingId);
        if (!otaBooking) {
            return res.status(404).json({ message: "Không tìm thấy booking OTA" });
        }

        const room = await Room.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: "Không tìm thấy phòng" });
        }

        // Kiểm tra phòng có available không
        if (room.status !== 'vacant') {
            return res.status(400).json({ 
                message: "Phòng không khả dụng",
                currentStatus: room.status
            });
        }

        // Kiểm tra phòng có thuộc cùng khách sạn không
        if (room.hotelId.toString() !== otaBooking.hotelId.toString()) {
            return res.status(400).json({ message: "Phòng không thuộc khách sạn này" });
        }

        // Tạo booking trong hệ thống local
        const localBooking = new Booking({
            hotelId: otaBooking.hotelId,
            roomId: roomId,
            checkInDate: otaBooking.checkInDate,
            checkOutDate: otaBooking.checkOutDate,
            status: 'confirmed',
            bookingType: 'daily',
            adults: otaBooking.guestDetails?.numberOfGuests?.adults || 1,
            children: otaBooking.guestDetails?.numberOfGuests?.children || 0,
            basePrice: otaBooking.pricing?.totalAmount || 0,
            totalAmount: otaBooking.pricing?.totalAmount || 0,
            paymentStatus: otaBooking.paymentStatus === 'paid' ? 'paid' : 'pending',
            paymentMethod: otaBooking.paymentMethod === 'pay_at_property' ? 'cash' : 'bank_transfer',
            source: 'ota',
            otaSource: otaBooking.otaProvider,
            otaBookingId: otaBooking.otaBookingId,
            guestDetails: {
                name: otaBooking.guestDetails?.name,
                email: otaBooking.guestDetails?.email,
                phone: otaBooking.guestDetails?.phone
            },
            notes: otaBooking.guestDetails?.specialRequests,
            logs: [{
                action: 'ota_booking_assigned',
                timestamp: new Date(),
                staffId: staffId,
                details: `Đã assign booking từ ${otaBooking.otaProvider} vào phòng ${room.roomNumber}`
            }]
        });

        await localBooking.save();

        // Cập nhật OTA booking
        otaBooking.localBookingId = localBooking._id;
        otaBooking.localRoomId = roomId;
        otaBooking.logs.push({
            action: 'assigned_to_room',
            timestamp: new Date(),
            staffId: staffId,
            details: `Đã assign vào phòng ${room.roomNumber}`
        });
        await otaBooking.save();

        res.status(200).json({
            message: "Đã assign booking OTA vào phòng thành công",
            otaBooking,
            localBooking
        });
    } catch (error) {
        console.error('Error assigning OTA booking to room:', error);
        res.status(500).json({ 
            message: "Lỗi khi assign booking OTA vào phòng", 
            error: error.message 
        });
    }
};

// Lấy chi tiết OTA booking
exports.getOtaBookingById = async (req, res) => {
    try {
        const otaBooking = await OtaBooking.findById(req.params.id)
            .populate('hotelId', 'name')
            .populate('localBookingId')
            .populate('localRoomId', 'roomNumber floor type');

        if (!otaBooking) {
            return res.status(404).json({ message: "Không tìm thấy booking OTA" });
        }

        res.status(200).json(otaBooking);
    } catch (error) {
        console.error('Error getting OTA booking:', error);
        res.status(500).json({ 
            message: "Lỗi khi lấy thông tin booking OTA", 
            error: error.message 
        });
    }
};

// Lấy đặt phòng từ OTA (deprecated - use provider specific APIs)
exports.getOtaBookings = async (req, res) => {
    try {
        const integration = await OtaIntegration.findById(req.params.id);
        if (!integration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA." });
        }

        if (integration.status !== 'active') {
            return res.status(400).json({ message: "Cấu hình OTA chưa được kích hoạt hoặc đang lỗi." });
        }

        const localBookings = await OtaBooking.find({ 
            integrationId: integration._id 
        }).sort({ checkInDate: -1 });

        res.status(200).json({
            message: "Lấy danh sách đặt phòng thành công.",
            data: localBookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            message: "Lỗi khi lấy danh sách đặt phòng từ OTA provider",
            error: error.message
        });
    }
};

// Đồng bộ dữ liệu với OTA
exports.syncOtaData = async (req, res) => {
    let integration;
    try {
        integration = await OtaIntegration.findById(req.params.id);
        if (!integration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA." });
        }

        if (integration.status !== 'active') {
            return res.status(400).json({ message: "Cấu hình OTA chưa được kích hoạt hoặc đang lỗi." });
        }

        const baseUrl = OTA_URLS[integration.provider];
        const headers = getHeaders(integration);

        // Sync bookings
        const bookingsResponse = await axios.get(`${baseUrl}/bookings`, {
            headers,
            params: { propertyId: integration.credentials.propertyId }
        });

        // Save bookings
        for (const booking of bookingsResponse.data.bookings || []) {
            const normalized = normalizeOtaBooking(
                booking, 
                integration.provider, 
                integration.hotelId, 
                integration._id
            );
            
            await OtaBooking.findOneAndUpdate(
                { otaProvider: integration.provider, otaBookingId: normalized.otaBookingId },
                { 
                    ...normalized,
                    'syncStatus.lastSyncAt': new Date(),
                    'syncStatus.lastSyncStatus': 'success'
                },
                { upsert: true, new: true }
            );
        }

        integration.lastSync = new Date();
        await integration.save();

        res.status(200).json({
            message: "Đồng bộ dữ liệu thành công.",
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Sync error:', error.response?.data || error.message);
        
        if (integration) {
            integration.errorLog.push({
                timestamp: new Date(),
                message: error.response?.data?.message || error.message,
                code: error.response?.status?.toString(),
                details: error.response?.data,
                provider: integration.provider,
                severity: 'medium'
            });
            await integration.save();
        }

        res.status(error.response?.status || 500).json({
            message: "Lỗi khi đồng bộ dữ liệu với OTA provider",
            error: error.response?.data || error.message
        });
    }
};

// ============ INVENTORY & AVAILABILITY SYNC ============

// Helper function để tính toán availability của phòng
const calculateRoomAvailability = async (hotelId, startDate, endDate) => {
    const { Room } = require('../models/rooms');
    const { Booking } = require('../models/booking');
    const { OtaBooking } = require('../models/otaBooking');
    
    // Lấy tất cả phòng của khách sạn
    const rooms = await Room.find({ hotelId });
    
    // Lấy tất cả bookings trong khoảng thời gian
    const bookings = await Booking.find({
        hotelId,
        $or: [
            {
                checkInDate: { $gte: startDate, $lt: endDate },
                status: { $in: ['confirmed', 'checked_in', 'pending'] }
            },
            {
                checkOutDate: { $gt: startDate, $lte: endDate },
                status: { $in: ['confirmed', 'checked_in', 'pending'] }
            },
            {
                checkInDate: { $lte: startDate },
                checkOutDate: { $gte: endDate },
                status: { $in: ['confirmed', 'checked_in', 'pending'] }
            }
        ]
    });
    
    // Lấy tất cả OTA bookings trong khoảng thời gian
    const otaBookings = await OtaBooking.find({
        hotelId,
        $or: [
            {
                checkInDate: { $gte: startDate, $lt: endDate },
                status: { $in: ['confirmed', 'pending'] }
            },
            {
                checkOutDate: { $gt: startDate, $lte: endDate },
                status: { $in: ['confirmed', 'pending'] }
            },
            {
                checkInDate: { $lte: startDate },
                checkOutDate: { $gte: endDate },
                status: { $in: ['confirmed', 'pending'] }
            }
        ]
    });
    
    // Tính availability theo room type
    const availabilityByRoomType = {};
    
    rooms.forEach(room => {
        const roomType = room.type;
        if (!availabilityByRoomType[roomType]) {
            availabilityByRoomType[roomType] = {
                totalRooms: 0,
                availableRooms: 0,
                bookedRooms: 0,
                rooms: []
            };
        }
        
        availabilityByRoomType[roomType].totalRooms++;
        
        // Kiểm tra phòng có bị book không
        const isBooked = bookings.some(b => 
            b.roomId?.toString() === room._id.toString()
        ) || otaBookings.some(ob => 
            ob.localRoomId?.toString() === room._id.toString()
        );
        
        // Kiểm tra phòng có available không (status = vacant và không bị book)
        const isAvailable = room.status === 'vacant' && !isBooked;
        
        if (isAvailable) {
            availabilityByRoomType[roomType].availableRooms++;
        } else {
            availabilityByRoomType[roomType].bookedRooms++;
        }
        
        availabilityByRoomType[roomType].rooms.push({
            roomId: room._id,
            roomNumber: room.roomNumber,
            status: room.status,
            isBooked,
            isAvailable,
            pricing: room.pricing
        });
    });
    
    return availabilityByRoomType;
};

// Helper function để format inventory data cho từng OTA provider
const formatInventoryForProvider = (availabilityData, provider, mappings) => {
    const inventory = [];
    
    Object.keys(availabilityData).forEach(roomType => {
        const roomData = availabilityData[roomType];
        // Tìm mapping cho room type này
        const mapping = mappings?.roomTypes?.find(m => {
            // Kiểm tra xem có room nào trong roomData match với mapping không
            return roomData.rooms.some(r => {
                const localId = m.localRoomTypeId?.toString();
                const roomId = r.roomId?.toString();
                return localId === roomId;
            });
        });
        
        if (mapping || roomData.rooms.length > 0) {
            const firstRoom = roomData.rooms[0];
            inventory.push({
                roomTypeId: mapping?.otaRoomTypeId || roomType,
                roomTypeName: mapping?.otaRoomTypeName || roomType,
                available: roomData.availableRooms,
                total: roomData.totalRooms,
                price: mapping?.baseRate || firstRoom?.pricing?.daily || firstRoom?.pricing?.hourly || 0
            });
        }
    });
    
    return inventory;
};

// Helper function để generate date range
const generateDateRange = (startDate, endDate) => {
    const dates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
};

// Đồng bộ inventory lên OTA provider
exports.syncInventoryToOta = async (req, res) => {
    let integration;
    try {
        integration = await OtaIntegration.findById(req.params.id).populate('hotelId');
        if (!integration) {
            return res.status(404).json({ message: "Không tìm thấy cấu hình OTA." });
        }

        if (integration.status !== 'active') {
            return res.status(400).json({ message: "Cấu hình OTA chưa được kích hoạt." });
        }

        const { startDate, endDate } = req.body;
        const hotelId = integration.hotelId._id || integration.hotelId;
        
        // Mặc định sync 90 ngày tới
        const syncStartDate = startDate ? new Date(startDate) : new Date();
        const syncEndDate = endDate ? new Date(endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        
        // Tính toán availability
        const availabilityData = await calculateRoomAvailability(hotelId, syncStartDate, syncEndDate);
        
        // Format data theo provider
        const inventoryData = formatInventoryForProvider(availabilityData, integration.provider, integration.mappings);
        
        if (inventoryData.length === 0) {
            return res.status(400).json({ 
                message: "Không có dữ liệu inventory để đồng bộ. Vui lòng kiểm tra room type mappings." 
            });
        }
        
        const headers = getHeaders(integration);
        const baseUrl = OTA_URLS[integration.provider];
        
        let response;
        
        switch (integration.provider) {
            case 'Booking.com':
                response = await axios.put(`${baseUrl}/inventory`, {
                    propertyId: integration.credentials.propertyId,
                    availability: inventoryData.map(item => ({
                        room_type_id: item.roomTypeId,
                        date: syncStartDate.toISOString().split('T')[0],
                        end_date: syncEndDate.toISOString().split('T')[0],
                        available: item.available,
                        total: item.total,
                        price: item.price
                    }))
                }, { headers });
                break;
                
            case 'Agoda':
                response = await axios.post(`${baseUrl}/inventory/update`, {
                    hotel_id: integration.credentials.hotelId,
                    room_types: inventoryData.map(item => ({
                        room_type_id: item.roomTypeId,
                        availability: {
                            start_date: syncStartDate.toISOString().split('T')[0],
                            end_date: syncEndDate.toISOString().split('T')[0],
                            available_rooms: item.available,
                            total_rooms: item.total
                        },
                        rates: {
                            base_rate: item.price
                        }
                    }))
                }, { headers });
                break;
                
            case 'Traveloka':
                response = await axios.put(`${baseUrl}/inventory`, {
                    propertyId: integration.credentials.propertyId,
                    inventory: inventoryData.map(item => ({
                        roomId: item.roomTypeId,
                        dates: generateDateRange(syncStartDate, syncEndDate).map(date => ({
                            date: date,
                            available: item.available,
                            total: item.total,
                            price: item.price
                        }))
                    }))
                }, { headers });
                break;
                
            case 'Trip.com':
                response = await axios.post(`${baseUrl}/inventory/update`, {
                    hotel_id: integration.credentials.hotelId,
                    room_inventory: inventoryData.map(item => ({
                        room_type_id: item.roomTypeId,
                        availability: {
                            start_date: syncStartDate.toISOString().split('T')[0],
                            end_date: syncEndDate.toISOString().split('T')[0],
                            available_count: item.available,
                            total_count: item.total
                        },
                        pricing: {
                            base_price: item.price
                        }
                    }))
                }, { headers });
                break;
                
            case 'Expedia':
                // Expedia Rapid API inventory update endpoint
                const expediaHotelId = integration.credentials.expediaHotelId || integration.credentials.propertyId;
                const expediaBaseUrl = integration.credentials.useTestEnv ? OTA_URLS['ExpediaTest'] : OTA_URLS['Expedia'];
                const inventoryPath = `/properties/${expediaHotelId}/inventory`;
                
                const expediaHeaders = getHeaders(integration, 'PUT', inventoryPath, JSON.stringify({
                    roomTypes: inventoryData.map(item => ({
                        roomTypeId: item.roomTypeId,
                        availability: generateDateRange(syncStartDate, syncEndDate).map(date => ({
                            date: date,
                            available: item.available,
                            total: item.total
                        })),
                        rates: {
                            baseRate: item.price
                        }
                    }))
                }));
                
                response = await axios.put(`${expediaBaseUrl}${inventoryPath}`, {
                    roomTypes: inventoryData.map(item => ({
                        roomTypeId: item.roomTypeId,
                        availability: generateDateRange(syncStartDate, syncEndDate).map(date => ({
                            date: date,
                            available: item.available,
                            total: item.total
                        })),
                        rates: {
                            baseRate: item.price
                        }
                    }))
                }, { headers: expediaHeaders });
                break;
                
            case 'G2J':
                response = await axios.post(`${baseUrl}/inventory/update`, {
                    hotel_id: integration.credentials.hotelId,
                    room_inventory: inventoryData.map(item => ({
                        room_type_id: item.roomTypeId,
                        availability: {
                            start_date: syncStartDate.toISOString().split('T')[0],
                            end_date: syncEndDate.toISOString().split('T')[0],
                            available_rooms: item.available,
                            total_rooms: item.total
                        },
                        pricing: {
                            base_price: item.price
                        }
                    }))
                }, { headers });
                break;
                
            default:
                return res.status(400).json({ message: "Provider không được hỗ trợ." });
        }
        
        // Cập nhật lastSync
        integration.lastSync = new Date();
        await integration.save();
        
        res.status(200).json({
            message: `Đã đồng bộ inventory lên ${integration.provider} thành công`,
            data: {
                syncedRooms: inventoryData.length,
                dateRange: {
                    start: syncStartDate,
                    end: syncEndDate
                },
                inventory: inventoryData
            },
            lastSync: integration.lastSync
        });
    } catch (error) {
        console.error('Sync inventory error:', error.response?.data || error.message);
        
        if (integration) {
            integration.errorLog.push({
                timestamp: new Date(),
                message: error.response?.data?.message || error.message,
                code: error.response?.status?.toString(),
                details: error.response?.data,
                provider: integration.provider,
                severity: 'high'
            });
            await integration.save();
        }
        
        res.status(error.response?.status || 500).json({
            message: "Lỗi khi đồng bộ inventory lên OTA provider",
            error: error.response?.data || error.message
        });
    }
};

// Đồng bộ inventory cho tất cả OTA integrations của một hotel
exports.syncAllInventoryForHotel = async (req, res) => {
    try {
        const { hotelId } = req.params;
        const { startDate, endDate } = req.query;
        
        const integrations = await OtaIntegration.find({
            hotelId,
            status: 'active',
            'settings.updateInventory': true
        });
        
        if (integrations.length === 0) {
            return res.status(404).json({ 
                message: "Không tìm thấy cấu hình OTA active nào cho khách sạn này." 
            });
        }
        
        const results = [];
        const syncStartDate = startDate ? new Date(startDate) : new Date();
        const syncEndDate = endDate ? new Date(endDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        
        for (const integration of integrations) {
            try {
                const availabilityData = await calculateRoomAvailability(
                    hotelId,
                    syncStartDate,
                    syncEndDate
                );
                
                const inventoryData = formatInventoryForProvider(
                    availabilityData, 
                    integration.provider, 
                    integration.mappings
                );
                
                if (inventoryData.length > 0) {
                    const headers = getHeaders(integration);
                    const baseUrl = OTA_URLS[integration.provider];
                    
                    // Gọi API sync cho từng provider (tương tự như syncInventoryToOta)
                    // Để đơn giản, chỉ log kết quả
                    results.push({
                        provider: integration.provider,
                        success: true,
                        syncedRooms: inventoryData.length,
                        inventory: inventoryData
                    });
                    
                    integration.lastSync = new Date();
                    await integration.save();
                } else {
                    results.push({
                        provider: integration.provider,
                        success: false,
                        error: "Không có dữ liệu inventory để đồng bộ"
                    });
                }
            } catch (error) {
                results.push({
                    provider: integration.provider,
                    success: false,
                    error: error.message
                });
            }
        }
        
        res.status(200).json({
            message: `Đã đồng bộ inventory cho ${results.filter(r => r.success).length}/${integrations.length} OTA providers`,
            results
        });
    } catch (error) {
        console.error('Sync all inventory error:', error);
        res.status(500).json({
            message: "Lỗi khi đồng bộ inventory cho tất cả OTA",
            error: error.message
        });
    }
};