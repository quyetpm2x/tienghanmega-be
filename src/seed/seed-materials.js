require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Material = require('../models/Material');

const data = [
  { order:0, src:'/assets/tai-lieu/hoc-lieu-1.svg', title:'Giáo trình Sơ Cấp 1',          cat:'Sơ cấp',    desc:'Bảng chữ cái Hangeul, cấu tạo câu và phát âm chuẩn bản ngữ',                              tag:'SC1',      color:'#c0392b' },
  { order:1, src:'/assets/tai-lieu/hoc-lieu-2.svg', title:'Giáo trình Sơ Cấp 2',          cat:'Sơ cấp',    desc:'Ngữ pháp A2, hội thoại cơ bản và 30 bài khoá tiếng Hàn sơ cấp',                        tag:'SC2',      color:'#E67E22' },
  { order:2, src:'/assets/tai-lieu/hoc-lieu-3.svg', title:'Giáo trình Trung Cấp 3',       cat:'Trung cấp', desc:'Phản xạ giao tiếp, 2000+ từ vựng và luyện thi TOPIK II',                                tag:'TC3',      color:'#1E3A5F' },
  { order:3, src:'/assets/tai-lieu/hoc-lieu-4.svg', title:'Tài liệu TOPIK II Cấp 3–4',    cat:'TOPIK',     desc:'150 mẫu ngữ pháp, 2000 từ vựng trung - cao cấp và đề thi thực chiến',                  tag:'TOPIK II', color:'#6366f1' },
  { order:4, src:'/assets/tai-lieu/hoc-lieu-5.svg', title:'Tài liệu Giao Tiếp Ứng Dụng', cat:'Giao tiếp', desc:'Hội thoại thực tế, phát âm chuẩn và phản xạ giao tiếp tự nhiên',                       tag:'GTUD',     color:'#10b981' },
  { order:5, src:'/assets/tai-lieu/hoc-lieu-6.svg', title:'Đề thi Ôn thi THPT Quốc Gia', cat:'Ôn thi',    desc:'Tổng ôn sơ - trung cấp, mẹo làm bài nhanh hướng đến 8–10 điểm',                        tag:'THPT',     color:'#dc2626' },
  { order:6, src:'/assets/tai-lieu/hoc-lieu-7.svg', title:'Lộ Trình Về Đích',             cat:'Lộ trình',  desc:'Từ 0 tới TOPIK II — lộ trình học toàn diện 126 buổi cùng MEGA',                         tag:'Bundle',   color:'#f6c937' },
  { order:7, src:'/assets/tai-lieu/hoc-lieu-8.svg', title:'Flash Card Từ Vựng TOPIK',     cat:'TOPIK',     desc:'Bộ flash card 500 từ vựng TOPIK I & II, phân loại theo chủ đề',                          tag:'TOPIK I',  color:'#E67E22' },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await Material.countDocuments();
  if (existing > 0) {
    console.log(`Đã có ${existing} tài liệu trong DB — bỏ qua seed. Dùng --force để ghi đè.`);
    if (!process.argv.includes('--force')) { await mongoose.disconnect(); return; }
    await Material.deleteMany({});
    console.log('Đã xoá toàn bộ tài liệu cũ.');
  }

  const result = await Material.insertMany(data);
  console.log(`✓ Đã thêm ${result.length} tài liệu vào DB:`);
  result.forEach(m => console.log(`  [${m.order}] ${m.title} (${m.tag})`));
  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
