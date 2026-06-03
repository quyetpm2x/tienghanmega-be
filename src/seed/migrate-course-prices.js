/**
 * Migration: set coursePrice for all students where coursePrice = 0
 * and sync tuitionStatus based on amount vs coursePrice.
 *
 * Run: node src/seed/migrate-course-prices.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const Student   = require('../models/Student');

function getPriceByLevel(level) {
  if (!level) return 1990000;
  const l = level.toLowerCase();
  if (l.includes('topik'))                                       return 3500000;
  if (l.includes('lộ trình') || l.includes('lo trinh'))         return 2990000;
  if (l.includes('ôn thi') || l.includes('on thi') || l.includes('thpt')) return 2990000;
  // Sơ cấp 1/2, Trung cấp, Giao tiếp, default
  return 1990000;
}

function getTuitionStatus(amount, coursePrice) {
  if (amount <= 0)               return 'unpaid';
  if (amount >= coursePrice)     return 'paid';
  return 'partial';
}

async function run() {
  await connectDB();

  const students = await Student.find({ coursePrice: { $in: [0, null, undefined] } });
  console.log(`Found ${students.length} students to migrate`);

  let updated = 0;
  for (const s of students) {
    const coursePrice    = getPriceByLevel(s.level);
    const tuitionStatus  = getTuitionStatus(s.amount || 0, coursePrice);
    await Student.updateOne({ _id: s._id }, { $set: { coursePrice, tuitionStatus } });
    console.log(`  ${s.name.padEnd(25)} | ${(s.level || '—').padEnd(25)} | ${coursePrice.toLocaleString('vi-VN')}đ | ${tuitionStatus}`);
    updated++;
  }

  console.log(`\nMigrated ${updated} students.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
