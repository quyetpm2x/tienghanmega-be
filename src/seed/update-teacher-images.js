require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Teacher = require('../models/Teacher');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  const res = await Teacher.updateMany({}, { $unset: { src: '' } });
  console.log(`✓ Đã xoá src của ${res.modifiedCount} giảng viên`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
