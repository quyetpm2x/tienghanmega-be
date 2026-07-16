require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const CourseCategory = require('../src/models/CourseCategory');
const Course = require('../src/models/Course');

// One-time: đẩy 5 danh mục khoá học mặc định vào DB (nếu chưa có) và gắn cat='intro'
// cho khoá "SƠ CẤP 1" (khoá còn lại trước đây bị coi là intro theo tên trên trang public
// đã được xác nhận với admin là KHÔNG map — giữ nguyên 'beginner').
// Lấy credentials từ .env rồi tự suy ra CẢ 2 tên DB (product/dev), không hardcode mật khẩu.
const baseUri = process.env.MONGODB_URI;
if (!baseUri) throw new Error('MONGODB_URI không có trong .env');
const PROD_URI = baseUri.replace(/tienghanmega_(product|dev)(?=\?)/, 'tienghanmega_product');
const DEV_URI  = baseUri.replace(/tienghanmega_(product|dev)(?=\?)/, 'tienghanmega_dev');

const CATEGORIES = [
  { key: 'intro',        label: 'Nhập Môn',        color: '#f59e0b', bg: '#fef3c7', order: 0 },
  { key: 'beginner',     label: 'Sơ - Trung Cấp',  color: '#c0392b', bg: '#fee2e2', order: 1 },
  { key: 'conversation', label: 'Giao Tiếp',       color: '#10b981', bg: '#d1fae5', order: 2 },
  { key: 'topik',        label: 'TOPIK II',        color: '#6366f1', bg: '#ede9fe', order: 3 },
  { key: 'bundle',       label: 'Lộ Trình',        color: '#E67E22', bg: '#fff3e0', order: 4 },
];

async function seedInto(uri, label) {
  await mongoose.connect(uri);
  console.log(`\n=== ${label} (${mongoose.connection.name}) ===`);

  let created = 0, skipped = 0;
  for (const cat of CATEGORIES) {
    const existing = await CourseCategory.findOne({ key: cat.key });
    if (existing) { console.log(`  skip (đã có): ${cat.label}`); skipped++; continue; }
    await CourseCategory.create(cat);
    console.log(`  created: ${cat.label}`);
    created++;
  }
  console.log(`Danh mục: ${created} created, ${skipped} skipped.`);

  const course = await Course.findOne({ title: 'SƠ CẤP 1' });
  if (!course) {
    console.log(`  không tìm thấy khoá "SƠ CẤP 1" trong DB này — bỏ qua.`);
  } else if (course.cat === 'intro') {
    console.log(`  khoá "SƠ CẤP 1" đã là cat=intro — bỏ qua.`);
  } else {
    const before = course.cat;
    course.cat = 'intro';
    await course.save();
    console.log(`  updated: "SƠ CẤP 1" cat ${before} -> intro`);
  }

  await mongoose.disconnect();
}

async function run() {
  await seedInto(PROD_URI, 'PRODUCT');
  await seedInto(DEV_URI, 'DEV');
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
