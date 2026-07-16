require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const FeedbackVideo = require('../src/models/FeedbackVideo');

// One-time: đẩy 7 video "Phản hồi của học viên" đang hardcode trong
// components/FeedbackVideos.tsx vào DB — an toàn re-run, bỏ qua videoId đã tồn tại.
// Lấy credentials từ .env rồi tự suy ra CẢ 2 tên DB (product/dev) bằng cách thay tên
// database trong URI — không hardcode mật khẩu trong file, và không phụ thuộc dòng
// nào đang "active" trong .env (tránh lặp lại sự cố ghi nhầm DB do đổi dòng active).
const baseUri = process.env.MONGODB_URI;
if (!baseUri) throw new Error('MONGODB_URI không có trong .env');
const PROD_URI = baseUri.replace(/tienghanmega_(product|dev)(?=\?)/, 'tienghanmega_product');
const DEV_URI  = baseUri.replace(/tienghanmega_(product|dev)(?=\?)/, 'tienghanmega_dev');

const VIDEOS = [
  { id: 'td-XJUz_w80', name: 'Gia Huấn',                   course: 'Combo Lộ Trình T11' },
  { id: 'WwWWCauNSqc', name: 'Học viên tặng cô Thảo Linh',  course: 'Combo Lộ Trình T12' },
  { id: 'F347d0OfjUY', name: 'Lê Hồng Khang',               course: 'Combo Lộ Trình T11' },
  { id: 'iotINrl2Dew', name: 'Trần Quang Huy',              course: 'Combo Lộ Trình T11' },
  { id: 'qmYW-vTA42g', name: 'Quỳnh Anh',                   course: 'Combo Lộ Trình T11' },
  { id: 'ClGGcZo1iX4', name: 'Trần Thị Ngọc',               course: 'Combo Lộ Trình T12' },
  { id: 'bM50EZVC1Hw', name: 'Bùi Yến Nhi',                 course: 'Combo Lộ Trình T11' },
];

async function seedInto(uri, label) {
  await mongoose.connect(uri);
  console.log(`\n=== ${label} (${mongoose.connection.name}) ===`);

  let created = 0, skipped = 0;
  for (let i = 0; i < VIDEOS.length; i++) {
    const v = VIDEOS[i];
    const existing = await FeedbackVideo.findOne({ videoId: v.id });
    if (existing) { console.log(`  skip (đã có): ${v.name}`); skipped++; continue; }
    await FeedbackVideo.create({
      youtubeUrl: `https://www.youtube.com/shorts/${v.id}`,
      videoId: v.id,
      name: v.name,
      course: v.course,
      order: i,
    });
    console.log(`  created: ${v.name} (${v.course})`);
    created++;
  }
  console.log(`${label}: ${created} created, ${skipped} skipped.`);
  await mongoose.disconnect();
}

async function run() {
  await seedInto(PROD_URI, 'PRODUCT');
  await seedInto(DEV_URI, 'DEV');
  console.log('\nDone.');
}

run().catch(err => { console.error(err); process.exit(1); });
