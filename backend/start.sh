#!/bin/bash

echo "===================================="
echo "Hotel Backend - Railway Deployment"
echo "===================================="
echo ""

# Exit on error
set -e

# Install dependencies
echo "[INFO] Đang cài đặt dependencies..."
npm ci --production=false

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

