const RoomEvent = require('../models/roomEvent'); // Schema bạn vừa cung cấp
const { Guest } = require('../models/guests');
const { Room } = require('../models/rooms');
const { Booking } = require('../models/booking');
const guestsController = require('./guestsController');
const { deleteCachePattern } = require('../config/cacheHelper');
// const io = require('../socket'); // Dùng Socket.io để realtime

exports.handleAiFaceDetection = async (req, res) => {
    try {
        const { hotelId, matchedGuests, includeStats, statsPeriod } = req.body; // Dữ liệu từ Python gửi qua

        if (!matchedGuests || matchedGuests.length === 0) {
            return res.status(200).json({ message: "Không có hành động" });
        }

        const eventsCreated = [];

        for (const match of matchedGuests) {
            const guest = await Guest.findById(match.guestId);
            if (!guest) continue;

            // 1. Kiểm tra xem khách này đang ở phòng nào không?
            // (Giả sử bạn có field currentRoomId trong Guest hoặc tìm trong Room collection)
            const occupiedRoom = await Room.findOne({ 
                hotelId: hotelId, 
                status: 'occupied',
                'currentBooking.guestInfo.idNumber': guest.personalInfo.idNumber 
            });

            if (occupiedRoom) {
                // KỊCH BẢN A: Khách đang lưu trú -> Cập nhật trạng thái ra/vào
                const eventType = match.direction === 'in' ? 'guest_return' : 'guest_out';
                
                // Tránh spam event (kiểm tra event cuối cùng cách đây vài phút chưa)
                const lastEvent = await RoomEvent.findOne({ roomId: occupiedRoom._id }).sort({ createdAt: -1 });
                if (lastEvent && lastEvent.type === eventType && (Date.now() - lastEvent.createdAt < 5 * 60 * 1000)) {
                    continue; // Bỏ qua nếu vừa ghi nhận trong vòng 5 phút
                }

                const label = await guestsController.computeGuestLabel({ hotelId, guestId: guest._id });
                const stayText = label?.currentStay?.durationSeconds
                  ? `Thời gian lưu trú: ${Math.floor(label.currentStay.durationSeconds / 3600)} giờ`
                  : '';
                const tagText = label?.isReturning ? 'Khách quen' : 'Khách vãng lai';

                const newRoomEvent = new RoomEvent({
                    roomId: occupiedRoom._id,
                    hotelId: hotelId,
                    type: eventType,
                    guestInfo: {
                        name: guest.personalInfo.fullName,
                        idNumber: guest.personalInfo.idNumber,
                        phone: guest.contactInfo?.phone,
                        email: guest.contactInfo?.email,
                        guestSource: 'walkin' // Hoặc lấy từ booking cũ
                    },
                    notes: `Camera AI: ${tagText}. ${match.direction === 'in' ? 'Quay lại' : 'Đi ra'} lúc ${new Date().toLocaleTimeString()}. ${stayText}`.trim()
                });

                await newRoomEvent.save();
                
                // Cập nhật trạng thái phụ của phòng (Để hiển thị icon trên giao diện UI)
                occupiedRoom.guestStatus = match.direction === 'in' ? 'in' : 'out';
                await occupiedRoom.save();

                eventsCreated.push(newRoomEvent);

                // Gửi Socket.io cập nhật UI Lễ tân ngay lập tức
                // io.getIO().to(hotelId.toString()).emit('room_status_changed', { roomId: occupiedRoom._id, status: occupiedRoom.guestStatus });

            } else {
                // KỊCH BẢN B: Khách KHÔNG đang ở phòng nào -> Kiểm tra xem có Booking hôm nay không?
                const todayBooking = await Booking.findOne({
                    hotelId: hotelId,
                    'guestDetails.idNumber': guest.personalInfo.idNumber,
                    status: 'confirmed',
                    checkInDate: { $lte: new Date(), $gte: new Date(new Date().setHours(0,0,0,0)) }
                });

                if (todayBooking) {
                    // Cảnh báo lễ tân: "Khách VIP Nguyễn Văn A đã đến sảnh, phòng 101 đã sẵn sàng!"
                    // Lưu ý: Thường hệ thống KHÔNG TỰ ĐỘNG tạo event 'checkin' ngay lập tức vì cần xác nhận thanh toán/đưa chìa khóa.
                    // Chỉ gửi Socket.io cảnh báo.
                    
                    // io.getIO().to(hotelId.toString()).emit('vip_guest_arrived', { 
                    //     guestName: guest.personalInfo.fullName,
                    //     bookingId: todayBooking._id
                    // });
                }
            }
        }

        let stats = undefined;
        const shouldIncludeStats = includeStats === true || includeStats === 1 || includeStats === '1' || includeStats === 'true';
        if (shouldIncludeStats && hotelId) {
            try {
                await deleteCachePattern(`ai:stats:${hotelId}:*`);
                stats = await guestsController.computeHotelGuestRoomStats(hotelId, statsPeriod || 'day');
            } catch (_) {
                stats = undefined;
            }
        }

        res.status(200).json({ 
            status: "success", 
            message: "Đã đồng bộ sự kiện AI",
            events: eventsCreated,
            stats
        });

    } catch (error) {
        console.error("Lỗi đồng bộ AI Event:", error);
        res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
};
