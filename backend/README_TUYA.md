# Hướng dẫn tích hợp Tuya Smart Switch

## 1. Cài đặt Package

Cài đặt package chính thức của Tuya:

```bash
cd nest/backend
npm install @tuya/tuya-connector-nodejs
```

Hoặc sử dụng pnpm:

```bash
cd nest/backend
pnpm add @tuya/tuya-connector-nodejs
```

## 2. Cấu hình Environment Variables

Thêm vào file `.env` trong thư mục `nest/backend`:

```env
# Tuya API Credentials
TUYA_ACCESS_ID=your_access_key_here
TUYA_ACCESS_SECRET=your_secret_key_here
TUYA_BASE_URL=https://openapi.tuyaus.com
TUYA_REGION=us
```

### Các region baseUrl:
- **US**: `https://openapi.tuyaus.com`
- **EU**: `https://openapi.tuyaeu.com`
- **CN**: `https://openapi.tuyacn.com`
- **IN**: `https://openapi.tuyain.com`

## 3. Lấy Tuya API Credentials

1. Đăng ký tài khoản tại [Tuya Developer Platform](https://developer.tuya.com/)
2. Tạo Cloud Project
3. Lấy **Access ID** và **Access Secret** từ project settings
4. Thêm credentials vào file `.env`

## 4. Sử dụng

Sau khi cài đặt package và cấu hình credentials, các API endpoints sẽ tự động sử dụng Tuya SDK thực tế thay vì mock data.

### API Endpoints:

- `GET /tuya/devices` - Lấy danh sách thiết bị
- `GET /tuya/devices/:deviceId` - Lấy thông tin thiết bị
- `GET /tuya/devices/:deviceId/status` - Lấy trạng thái thiết bị
- `POST /tuya/devices/:deviceId/turn-on` - Bật công tắc
- `POST /tuya/devices/:deviceId/turn-off` - Tắt công tắc
- `POST /tuya/devices/:deviceId/toggle` - Toggle công tắc
- `POST /tuya/rooms/:roomId/auto-turn-on` - Tự động bật khi check-in
- `POST /tuya/rooms/:roomId/auto-turn-off` - Tự động tắt khi check-out

## 5. Tài liệu tham khảo

- [Tuya Developer Documentation](https://developer.tuya.com/)
- [Tuya Connector Node.js SDK](https://github.com/tuya/tuya-connector-nodejs)
- [Tuya Open API Reference](https://developer.tuya.com/en/docs/iot/open-api/api-reference/smart-home-devices/device-control/device-control?id=K989ru6ftv8g0)

