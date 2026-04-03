/**
 * Script migration để chuyển events từ room.events array sang RoomEvent collection
 * Chạy script này một lần để migrate dữ liệu cũ
 * 
 * Usage: node scripts/migrate-room-events.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { Room } = require('../models/rooms');
const RoomEvent = require('../models/roomEvent');

async function migrateRoomEvents() {
  try {
    // Kết nối database
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hotelapp';
    await mongoose.connect(mongoUri);
    console.log('Đã kết nối database');

    // Lấy tất cả phòng có events
    const rooms = await Room.find({ 
      events: { $exists: true, $ne: [] } 
    }).select('_id hotelId roomNumber events');

    console.log(`Tìm thấy ${rooms.length} phòng có events`);

    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const room of rooms) {
      try {
        if (!room.events || room.events.length === 0) {
          continue;
        }

        console.log(`\nĐang migrate phòng ${room.roomNumber} (${room._id}) - ${room.events.length} events`);

        // Kiểm tra xem đã migrate chưa
        const existingEvents = await RoomEvent.countDocuments({ roomId: room._id });
        if (existingEvents > 0) {
          console.log(`  ⚠️  Phòng này đã có ${existingEvents} events trong collection mới, bỏ qua`);
          totalSkipped++;
          continue;
        }

        // Chuyển đổi events sang format RoomEvent
        const eventsToInsert = room.events.map(event => ({
          roomId: room._id,
          hotelId: room.hotelId,
          type: event.type,
          checkinTime: event.checkinTime,
          checkoutTime: event.checkoutTime,
          expectedCheckoutTime: event.expectedCheckoutTime,
          payment: event.payment,
          userId: event.userId,
          staffId: event.staffId,
          guestInfo: event.guestInfo,
          paymentMethod: event.paymentMethod,
          rateType: event.rateType,
          advancePayment: event.advancePayment,
          additionalCharges: event.additionalCharges,
          discount: event.discount,
          notes: event.notes,
          selectedServices: event.selectedServices,
          transferredFrom: event.transferredFrom,
          transferredAt: event.transferredAt,
          transferredBy: event.transferredBy,
          cancelledAt: event.cancelledAt,
          cancelReason: event.cancelReason,
          createdAt: event.createdAt || event.checkinTime || new Date(),
          updatedAt: event.updatedAt || new Date()
        }));

        // Insert vào RoomEvent collection
        if (eventsToInsert.length > 0) {
          await RoomEvent.insertMany(eventsToInsert, { ordered: false });
          console.log(`  ✅ Đã migrate ${eventsToInsert.length} events`);
          totalMigrated += eventsToInsert.length;
        }

        // Giữ lại chỉ 100 events gần nhất trong room document (để backward compatibility)
        if (room.events.length > 100) {
          room.events = room.events.slice(-100);
          await room.save();
          console.log(`  📝 Đã giảm events trong room document xuống 100 events gần nhất`);
        }

      } catch (error) {
        console.error(`  ❌ Lỗi khi migrate phòng ${room.roomNumber}:`, error.message);
        totalErrors++;
      }
    }

    console.log('\n=== KẾT QUẢ MIGRATION ===');
    console.log(`✅ Tổng số events đã migrate: ${totalMigrated}`);
    console.log(`⏭️  Số phòng đã bỏ qua (đã migrate trước đó): ${totalSkipped}`);
    console.log(`❌ Số lỗi: ${totalErrors}`);
    console.log('\nMigration hoàn tất!');

  } catch (error) {
    console.error('Lỗi migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối database');
    process.exit(0);
  }
}

// Chạy migration
if (require.main === module) {
  migrateRoomEvents();
}

module.exports = { migrateRoomEvents };

