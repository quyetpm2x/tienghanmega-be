require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Class = require('../src/models/Class');

// One-time: đặt showOnSchedule = false cho TẤT CẢ lớp học, khớp với việc đổi default
// của field này sang false (Class.js) — không lớp nào tự động hiện ở mục "Lớp sắp khai
// giảng" trên trang chủ nữa, admin phải tự bật lại từng lớp muốn hiển thị.
async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  const result = await Class.updateMany({}, { $set: { showOnSchedule: false } });
  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}.`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
