#!/bin/bash

echo "===================================="
echo "Hotel Backend - Railway Deployment"
echo "===================================="
echo ""

# Exit on error
set -e

# Chuyển vào thư mục backend
cd backend

# Install dependencies
echo "[INFO] Đang cài đặt dependencies..."
npm install --production=false

# Rebuild native modules nếu cần (cho bcrypt và các module khác)
echo "[INFO] Đang rebuild native modules..."
npm rebuild || true

echo ""
echo "[INFO] Dependencies đã được cài đặt"
echo ""

# Chạy migrations/seeders nếu cần (uncomment nếu có)
# echo "[INFO] Đang chạy migrations..."
# node scripts/migrate-room-events.js

# echo "[INFO] Đang chạy seeders..."
# node seeders/seed-users.js

echo "[INFO] Đang khởi động ứng dụng..."
echo "[INFO] PORT: ${PORT:-3000}"
echo ""

# Start ứng dụng
# Railway sẽ tự động set PORT environment variable
node ./bin/www

