# Migration Room Events

## Vấn đề
Khi số lượng events trong phòng tăng lên (ví dụ: 12,286 events), document Room sẽ vượt quá giới hạn BSON 16MB của MongoDB, gây ra lỗi `RangeError [ERR_OUT_OF_RANGE]`.

## Giải pháp
Tách events ra collection riêng `RoomEvent` để:
- Giữ document Room nhỏ gọn (chỉ giữ 100 events gần nhất)
- Events có thể tăng trưởng không giới hạn trong collection riêng
- Dễ query và quản lý events
- Tránh lỗi BSON size limit

## Cách chạy migration

### 1. Chạy script migration
```bash
cd nest/backend
node scripts/migrate-room-events.js
```

Script sẽ:
- Tìm tất cả phòng có events
- Chuyển events từ `room.events` array sang `RoomEvent` collection
- Giữ lại chỉ 100 events gần nhất trong `room.events` (để backward compatibility)
- Bỏ qua các phòng đã migrate trước đó

### 2. Kiểm tra kết quả
Sau khi migration xong, bạn có thể kiểm tra:
```javascript
// Đếm số events trong collection mới
db.roomevents.countDocuments()

// Xem events của một phòng cụ thể
db.roomevents.find({ roomId: ObjectId("...") }).sort({ createdAt: -1 }).limit(10)
```

## Cấu trúc mới

### RoomEvent Collection
- `roomId`: ID của phòng
- `hotelId`: ID của khách sạn
- `type`: Loại event (checkin, checkout, booking, etc.)
- Tất cả các trường khác giống như event trong room.events

### Room Document
- Vẫn giữ `events` array nhưng chỉ chứa 100 events gần nhất
- Để backward compatibility với code cũ

## API Changes

### GET /rooms/:id
- Mặc định lấy events từ `RoomEvent` collection (1000 events gần nhất)
- Có thể thêm query param `includeOldEvents=true` để lấy cả events cũ trong room document
- Có thể thêm query param `limit=500` để giới hạn số lượng events

### Các API khác
- Tất cả các API tạo events (checkin, checkout, booking, etc.) sẽ tự động lưu vào cả `RoomEvent` collection và `room.events` array
- `room.events` sẽ tự động giới hạn ở 100 events gần nhất

## Lưu ý
- Migration script an toàn, có thể chạy nhiều lần
- Script sẽ bỏ qua các phòng đã migrate
- Events cũ trong `room.events` vẫn được giữ lại (100 events gần nhất) để backward compatibility
- Sau khi migration, các events mới sẽ được lưu vào cả hai nơi tự động

