#!/bin/bash
# Copy toàn bộ data từ database production → development
#
# Lấy URI production từ .env (NODE_ENV=production, dùng bởi `npm run start`)
# Lấy URI development từ .env.development (dùng bởi `npm run dev`)
# Xem src/server.js: đây là 2 file khác nhau, mỗi file có MONGODB_URI riêng
# (đã chứa sẵn tên database trong URI, vd .../tienghanmega_product hoặc .../tienghanmega_dev)
#
# Chạy: npm run copy-prod-to-dev (từ thư mục tienghanmega-be)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PROD_ENV_FILE="$ROOT_DIR/.env"
DEV_ENV_FILE="$ROOT_DIR/.env.development"

if [ ! -f "$PROD_ENV_FILE" ]; then
  echo "❌  Không tìm thấy $PROD_ENV_FILE"
  exit 1
fi
if [ ! -f "$DEV_ENV_FILE" ]; then
  echo "❌  Không tìm thấy $DEV_ENV_FILE"
  exit 1
fi

# Load riêng từng file để không bị ghi đè lẫn nhau
set -a
source "$PROD_ENV_FILE"
set +a
PROD_URI="$MONGODB_URI"
unset MONGODB_URI

set -a
source "$DEV_ENV_FILE"
set +a
DEV_URI="$MONGODB_URI"
unset MONGODB_URI

if [ -z "$PROD_URI" ]; then
  echo "❌  MONGODB_URI không có trong .env"
  exit 1
fi
if [ -z "$DEV_URI" ]; then
  echo "❌  MONGODB_URI không có trong .env.development"
  exit 1
fi
if [ "$PROD_URI" == "$DEV_URI" ]; then
  echo "❌  URI production và development đang giống hệt nhau — dừng lại để tránh ghi đè nhầm production."
  exit 1
fi

echo "⚠️  Sắp copy toàn bộ data: production (.env) → development (.env.development)"
echo "⚠️  Toàn bộ collection hiện có trong database development sẽ bị XÓA và ghi đè."
read -p "Nhập 'YES' để tiếp tục: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "❌  Đã hủy."
  exit 1
fi

DATE=$(date +%Y-%m-%d_%H-%M)
DUMP_DIR="$ROOT_DIR/backups/${DATE}_prod-to-dev"

echo "📦  Đang dump database production ..."
mongodump --uri="$PROD_URI" --out="$DUMP_DIR"

# mongodump tạo 1 thư mục con duy nhất tên = database name lấy từ URI
DB_DUMP_SUBDIR=$(find "$DUMP_DIR" -mindepth 1 -maxdepth 1 -type d)
if [ -z "$DB_DUMP_SUBDIR" ]; then
  echo "❌  Không tìm thấy dữ liệu vừa dump trong $DUMP_DIR"
  exit 1
fi

echo "♻️   Đang restore vào database development ..."
mongorestore --uri="$DEV_URI" --drop "$DB_DUMP_SUBDIR"

echo "✅  Xong. Dump gốc được lưu tại: $DUMP_DIR (để rollback nếu cần)"
