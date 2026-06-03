require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Teacher = require('../models/Teacher');

// Map tên giảng viên -> file ảnh tách nền
const MAP = {
  'Cô Quỳnh Thư':   'co-quynh-thu.svg',
  'Cô Đinh Sang':   'co-dinh-sang.svg',
  'Cô Thu Trang':   'co-thu-trang.svg',
  'Cô Ánh Linh':    'co-anh-linh.svg',
  'Thầy Hongsik':   'thay-hongsik.svg',
  'Cô Phương Linh': 'co-phuong-linh.svg',
  'Cô Nguyễn Nga':  'co-nguyen-ngan.svg',
  'Cô Nông Sen':    'co-nong-sen.svg',
  'Cô Thanh Chúc':  'co-thanh-truc.svg',
  'Cô Mỹ Hạnh':     'co-my-hanh.svg',
  'Cô Thảo Linh':   'co-thao-linh.svg',
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  let updated = 0, skipped = 0;
  for (const [name, file] of Object.entries(MAP)) {
    const url = `/uploads/teachers/${file}`;
    const res = await Teacher.findOneAndUpdate({ name }, { src: url }, { new: true });
    if (res) { console.log(`✓ ${name} => ${url}`); updated++; }
    else      { console.log(`⚠ Không tìm thấy: ${name}`); skipped++; }
  }

  console.log(`\nDone: ${updated} cập nhật, ${skipped} không tìm thấy.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
