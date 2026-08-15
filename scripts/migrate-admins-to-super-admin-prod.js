// PRODUCTION — chỉ đọc .env, KHÔNG fallback sang .env.development dưới bất kỳ
// điều kiện nào. File riêng biệt hoàn toàn với bản dev (migrate-admins-to-super-
// admin.js) để không bao giờ mập mờ đang chạy vào DB nào.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
if (!process.env.MONGODB_URI) { console.error('Thiếu MONGODB_URI trong .env — dừng lại.'); process.exit(1); }
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Admin = require('../src/models/Admin');

// One-time (production): xem chú thích đầy đủ ở bản dev cùng thư mục — trước khi
// có tính năng phân quyền, mọi Admin đều có toàn quyền trên thực tế. Nếu không
// chạy migration này, admin production hiện có sẽ rơi vào role mặc định 'admin'
// (permissions rỗng) và MẤT HẾT quyền truy cập ngay khi permit() được deploy.
// Chỉ động vào doc CHƯA phải super_admin — chạy lại nhiều lần vẫn an toàn.

async function migrateAdminsToSuperAdmin() {
  const res = await Admin.updateMany(
    { role: { $ne: 'super_admin' } },
    { $set: { role: 'super_admin', permissions: [] } }
  );
  console.log(`  [PRODUCTION] admins: ${res.modifiedCount} tài khoản được nâng thành super_admin (matched: ${res.matchedCount}).`);
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB (PRODUCTION)');

  await migrateAdminsToSuperAdmin();

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
