// Gom teacherAssignments + rateHistory vào phases[].teachers — mỗi khoá học của lớp tự chứa
// giảng viên và lương của riêng nó.
//
// Cắt theo HỢP CỦA MỌI MỐC NGÀY (biên khoá ∩ biên phân công ∩ ngày đổi lương) nên số lương
// BẤT BIẾN theo thiết kế: một giảng viên có thể xuất hiện nhiều lần trong cùng một khoá với
// các mức khác nhau, đúng như rateHistory đang mô tả.
//
// Quy trình chuẩn (chạy dev trước, prod sau):
//   node scripts/verify-payroll-unchanged.js --env-file=.env.development > /tmp/before.json
//   node scripts/migrate-class-phase-teachers.js --env-file=.env.development
//   node scripts/migrate-class-phase-teachers.js --env-file=.env.development --apply
//   node scripts/verify-payroll-unchanged.js --env-file=.env.development > /tmp/after.json
//   diff /tmp/before.json /tmp/after.json     # PHẢI RỖNG
require('../src/config/timezone');   // PHẢI đứng trước mọi require khác
const path = require('path');

const argValue = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argValue('env-file');
const apply = process.argv.includes('--apply');
if (!envFile) {
  console.error('Thiếu --env-file=<file env> (VD: --env-file=.env.development)');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
if (!process.env.MONGODB_URI) {
  console.error(`Không có MONGODB_URI trong ${envFile}`);
  process.exit(1);
}

const mongoose = require('mongoose');
const Class = require('../src/models/Class');
const { effectivePhases, validatePhases } = require('../src/utils/classPhase');
const { teachersOfPhase } = require('../src/utils/phaseTeacherMigration');

const money = n => (n == null ? '(mức mặc định)' : `${Number(n).toLocaleString('vi-VN')}đ`);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Database đích: ${mongoose.connection.name}   ·   Chế độ: ${apply ? 'GHI THẬT' : 'CHẠY THỬ — không ghi gì'}\n`);

  const classes = await Class.find().lean();
  let changed = 0, skipped = 0, noTeacher = 0;

  for (const c of classes) {
    if ((c.phases || []).some(p => (p.teachers || []).length)) { skipped++; continue; }

    const phases = effectivePhases(c).map(p => ({
      courseTitle: p.courseTitle, courseCategory: p.courseCategory ?? null,
      days: p.days, time: p.time || '',
      fromDate: p.fromDate, toDate: p.toDate || null,
      teachers: teachersOfPhase(c, p),
    }));

    // Lớp thiếu dữ liệu (chưa có ngày khai giảng, thứ học sai...) sẽ vỡ ở đây — bỏ qua và
    // báo, chứ không ghi một cấu hình không hợp lệ đè lên.
    try { validatePhases(phases); }
    catch (e) { console.log(`⛔ ${c.name}: BỎ QUA — ${e.message}`); skipped++; continue; }

    changed++;
    console.log(`\n${c.name}`);
    for (const p of phases) {
      console.log(`  ${p.courseTitle}  ${p.fromDate} → ${p.toDate || 'nay'}  ${p.days}${p.time ? ' ' + p.time : ''}`);
      for (const a of p.teachers) {
        console.log(`    ${a.teacherName || '(không tên)'}  ${a.fromDate} → ${a.toDate || 'nay'}  ${money(a.rate)}`);
      }
      if (!p.teachers.length) { console.log('    ⚠️  không có giảng viên nào'); noTeacher++; }
    }
    if (apply) await Class.updateOne({ _id: c._id }, { $set: { phases } });
  }

  console.log(`\n${apply ? 'ĐÃ GHI' : 'CHẠY THỬ'}: ${changed} lớp di trú, ${skipped} lớp bỏ qua, ${classes.length} lớp tổng`);
  if (noTeacher) console.log(`⚠️  ${noTeacher} khoá không có giảng viên nào — buổi dạy trong khoảng đó không tính cho ai`);
  if (!apply) console.log('Thêm --apply để ghi thật.');
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
