// One-time: đồng bộ lại Student.level theo đúng Class.course HIỆN TẠI cho những học
// sinh đã bị lệch dữ liệu từ trước (khi admin đổi khoá học gắn với 1 lớp mà chưa có
// đoạn cascade-update trong classController.update — xem commit sửa kèm script này).
// Chỉ động tới student có classId hợp lệ trỏ tới 1 lớp đang tồn tại; student không có
// classId (dữ liệu cũ/tạo tay không gắn lớp) được bỏ qua nguyên vẹn.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', envFile) });
if (!process.env.MONGODB_URI) require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Class = require('../src/models/Class');
const Student = require('../src/models/Student');

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  const classes = await Class.find({}, '_id course name');
  let totalChanged = 0;

  for (const cls of classes) {
    const res = await Student.updateMany(
      { classId: cls._id, level: { $ne: cls.course } },
      { $set: { level: cls.course } }
    );
    if (res.modifiedCount > 0) {
      console.log(`  Lớp "${cls.name}": đồng bộ ${res.modifiedCount} học sinh -> level = "${cls.course}"`);
      totalChanged += res.modifiedCount;
    }
  }

  console.log(`Done. Tổng cộng ${totalChanged} học sinh đã được đồng bộ lại level.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
