// CHỈ đọc .env.development — không có fallback sang .env (production) dưới bất
// kỳ điều kiện nào (xem ghi chú an toàn ở migrate-vocab-gametype.js).
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.development') });
if (!process.env.MONGODB_URI) { console.error('Thiếu MONGODB_URI trong .env.development — dừng lại, không fallback sang .env.'); process.exit(1); }
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Admin = require('../src/models/Admin');

// One-time: trước khi có tính năng phân quyền, MỌI tài khoản Admin đều có toàn
// quyền trên thực tế (route /admin/* chỉ kiểm tra "có đăng nhập" chứ không phân
// biệt ai được làm gì). Nếu không chạy migration này, admin cũ sẽ tự động rơi vào
// role mặc định 'admin' (permissions rỗng) và MẤT HẾT quyền truy cập ngay khi
// tính năng permit() được triển khai — script này "vá" toàn bộ Admin hiện có
// thành super_admin để giữ nguyên quyền truy cập như trước, không ai bị khoá.
// Từ nay về sau, chỉ tài khoản admin TẠO MỚI qua trang "Quản trị viên" mới mặc
// định là 'admin' (permissions rỗng, phải tick tay).
//
// CHỈ ĐỘNG DỮ LIỆU VÀO DOC CHƯA PHẢI super_admin. Chạy lại nhiều lần vẫn an toàn.

async function migrateAdminsToSuperAdmin() {
  const res = await Admin.updateMany(
    { role: { $ne: 'super_admin' } },
    { $set: { role: 'super_admin', permissions: [] } }
  );
  console.log(`  admins: ${res.modifiedCount} tài khoản được nâng thành super_admin (matched: ${res.matchedCount}).`);
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  await migrateAdminsToSuperAdmin();

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
