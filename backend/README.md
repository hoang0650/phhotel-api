# Nest Backend (Express)

## Tổng quan
- Framework: Express + Mongoose
- Chức năng: Users, Rooms, Hotels, Invoices, Payments (SePay/PayPal/Crypto), Tuya, AI Assistant, Swagger
- CORS bật với `credentials: true` và `origin` phù hợp

## Scripts
- Chạy dev: `npm run dev`
- Chạy production: `npm start`
- Test toàn bộ: `npm test`
- Test đăng nhập: `npm run test:login`

## Thiết lập môi trường (.env)
- `MDB_CONNECT` → chuỗi kết nối MongoDB
- `JWT_SECRET` → secret ký access token
- `REFRESH_TOKEN_SECRET` → secret ký refresh token
- `NODE_ENV` → `production` để bật cookie Secure
- Các biến tích hợp khác: SePay, PayPal, Tuya… tuỳ module

## Luồng Auth an toàn XSS
- Đăng nhập: `POST /users/login`
  - Trả access token (15m) và set `refreshToken` cookie (30d) tại đường dẫn `/users`
  - Cookie: `HttpOnly`, `SameSite=strict`, `Secure` khi production
- Cấp lại token: `POST /users/refresh-token`
  - Đọc `refreshToken` từ cookie và trả access token mới
- Đăng xuất: `POST /users/logout`
  - Xoá cookie `refreshToken`

## CORS và Cookie
- Cấu hình tại [app.js](file:///c:/Users/Admin/Desktop/PHHotel/nest/backend/app.js#L137-L145)
  - `origin`: `http://localhost:4200`, `https://phhotel.vercel.app`
  - `credentials: true`
- Trên frontend Angular, gọi refresh với `withCredentials: true`

## Endpoints chính
- Users: [routes/users.js](file:///c:/Users/Admin/Desktop/PHHotel/nest/backend/routes/users.js#L193-L199)
  - `POST /users/login`
  - `POST /users/refresh-token`
  - `POST /users/logout`
  - `GET /users/info`, `GET /users/profile`, `PUT /users/profile`, `PUT /users/preferences`
- Rooms/Hotels/Bookings/Invoices… theo từng router trong thư mục `routes/`

## Swagger
- Truy cập: `/api-docs`
- Cấu hình: `swagger/swagger.js`

## Ghi chú bảo mật
- Không log token ra console
- Không trả password/twoFactorSecret trong response
- Hạn chế quyền theo vai trò qua middleware `authenticateToken`, `authorizeRoles`
