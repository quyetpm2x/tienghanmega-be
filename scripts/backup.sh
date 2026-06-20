#!/bin/bash
# Backup MongoDB Atlas → backups/YYYY-MM-DD_HH-MM/
# Chạy: npm run backup (từ thư mục tienghanmega-be)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌  Không tìm thấy $ENV_FILE"
  exit 1
fi

# Load biến môi trường an toàn
set -a
source "$ENV_FILE"
set +a

if [ -z "$MONGODB_URI" ]; then
  echo "❌  MONGODB_URI không có trong .env"
  exit 1
fi

DATE=$(date +%Y-%m-%d_%H-%M)
OUT="$ROOT_DIR/backups/$DATE"

mkdir -p "$OUT"

echo "📦  Đang backup vào $OUT ..."
mongodump --uri="$MONGODB_URI" --out="$OUT"
echo "✅  Backup xong: $OUT"
