# MongoDB Backup & Restore

## Cấu trúc database

| Database | Mục đích | Lệnh khởi động |
|---|---|---|
| `tienghanmega_product` | Production — data thật | `npm run start` |
| `tienghanmega_dev` | Development — dev riêng | `npm run dev` |
| `test` | Dự phòng (backup gốc) | — |

---

## Backup

```bash
# Chạy từ thư mục tienghanmega-be/
npm run backup
# → Lưu vào backups/YYYY-MM-DD_HH-MM/
```

Backup được lưu tại: `tienghanmega-be/backups/<ngày-giờ>/tienghanmega_product/`

---

## Restore

### Restore vào một database cụ thể

```bash
mongorestore \
  --uri="mongodb+srv://tienghanmega:tienghanmega6868@cluster0.ukmcscv.mongodb.net/?appName=Cluster0" \
  --db=<tên_database> \
  backups/<ngày-giờ>/<tên_database>/
```

**Ví dụ — copy data từ `test` vào `tienghanmega_product`:**
```bash
mongorestore \
  --uri="mongodb+srv://tienghanmega:tienghanmega6868@cluster0.ukmcscv.mongodb.net/?appName=Cluster0" \
  --db=tienghanmega_product \
  backups/2026-06-15_01-28/test/
```

**Ví dụ — copy data từ `test` vào `tienghanmega_dev`:**
```bash
mongorestore \
  --uri="mongodb+srv://tienghanmega:tienghanmega6868@cluster0.ukmcscv.mongodb.net/?appName=Cluster0" \
  --db=tienghanmega_dev \
  backups/2026-06-15_01-28/test/
```

> ⚠️ Không đặt tên database trong URI khi đã dùng `--db` (sẽ bị lỗi conflict)

---

## Lưu ý quan trọng

- Folder `backups/` đã có trong `.gitignore` — không bị push lên GitHub
- `mongodump` chỉ **đọc** data, không xoá hay sửa database gốc
- Mỗi lần `npm run backup` tạo folder mới theo ngày giờ, không ghi đè backup cũ
- Sau khi thay đổi `.env`, phải **restart backend** để kết nối đúng database
