require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const Level = require('../models/Level');

const LEVELS = [
  'Người mới bắt đầu',
  'Đã học bảng chữ cái',
  'Đã hoàn thành SC1',
  'Đã hoàn thành SC2',
  'Đã hoàn thành Trung Cấp',
  'Đã có TOPIK I',
  'Đã hoàn thành 60 bài EPS',
  'Đã có TOPIK II',
];

async function run() {
  await connectDB();
  await Level.deleteMany({});
  await Level.insertMany(LEVELS.map((label, i) => ({ label, order: i, active: true })));
  console.log(`Seeded ${LEVELS.length} levels`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
