// Quét buổi dạy / điểm danh nằm NGOÀI lịch của lớp ("mồ côi"). CHỈ ĐỌC, không ghi gì.
//
// Vì sao cần: attendanceController.create và studentAttendanceController.create nhận
// `date` thẳng từ client và chưa bao giờ kiểm ngày đó có nằm trong lịch lớp hay không.
// Bản ghi mồ côi không được tính vào lịch nhưng vẫn nằm trong DB — riêng buổi DẠY THAY
// còn được trả tiền cho một ngày lớp không hề có lịch.
//
// Chạy và dọn sạch TRƯỚC khi bật ràng buộc ở src/utils/classDate.js — nếu bật trước,
// validate ở update sẽ chặn luôn chính thao tác dọn.
//
//   node scripts/find-orphan-sessions.js --env-file=.env.development
//   node scripts/find-orphan-sessions.js --env-file=.env.development --report=backups/orphans.json
require('../src/config/timezone');   // PHẢI đứng trước mọi require khác
const path = require('path');
const fs = require('fs');

const argValue = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argValue('env-file');
const reportPath = argValue('report');
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
const TeacherSession = require('../src/models/TeacherSession');
const StudentAttendance = require('../src/models/StudentAttendance');
const TeacherPayment = require('../src/models/TeacherPayment');
const PayrollSettings = require('../src/models/PayrollSettings');
const { isValidClassDate } = require('../src/utils/classDate');
const { belongsToClass } = require('../src/utils/classLink');
const { resolveSession } = require('../src/utils/sessionPay');
const { teacherIdOnDate } = require('../src/utils/classAssignment');
const { payPeriodLabel, todayDateStr, DEFAULT_PAY_PERIOD_START_DAY } = require('../src/utils/teacherLedger');

const STATUS_VI = { taught: 'đã dạy', 'not-taught': 'không dạy', absent: 'vắng', rescheduled: 'dời lịch', substituted: 'dạy thay' };
const money = n => (n || 0).toLocaleString('vi-VN');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Database đích: ${mongoose.connection.name}   ·   Chế độ: CHỈ ĐỌC\n`);

  const startDay = (await PayrollSettings.findOne().lean())?.startDay || DEFAULT_PAY_PERIOD_START_DAY;
  const [classes, sessions, attendances, payments] = await Promise.all([
    Class.find().lean(),
    TeacherSession.find().lean(),
    StudentAttendance.find().lean(),
    TeacherPayment.find().lean(),
  ]);

  const rows = [];

  for (const c of classes) {
    for (const s of sessions) {
      if (!belongsToClass(s, c)) continue;   // bản ghi cũ nối theo TÊN lớp cũng phải tính
      if (isValidClassDate(c, s, 'session')) continue;
      const r = resolveSession(c, s, teacherIdOnDate(c, s.date));
      rows.push({
        loai: 'buổi dạy', lop: c.name, ngay: s.date,
        trangThai: STATUS_VI[s.status] || s.status,
        giangVien: s.paidTeacherName || s.substituteTeacherName || s.teacherName || '',
        tien: r.rate || 0, ky: payPeriodLabel(r.payDate, startDay), id: String(s._id),
      });
    }

    for (const a of attendances) {
      if (!belongsToClass(a, c)) continue;
      // Buổi học bù được điểm danh vào NGÀY MỚI — hợp lệ nếu replacesDate trỏ vào lịch.
      if (isValidClassDate(c, a, 'attendance')) continue;
      rows.push({
        loai: 'điểm danh', lop: c.name, ngay: a.date,
        trangThai: a.replacesDate ? `bù cho ${a.replacesDate}` : '',
        giangVien: '', tien: 0, ky: '', id: String(a._id),
      });
    }
  }

  // Bản ghi trỏ vào lớp không còn tồn tại — cũng là mồ côi, và không lớp nào ở trên bắt được.
  // Nhận diện bằng "không khớp lớp nào" chứ không bằng classId: bản ghi cũ chỉ có className.
  const matched = new Set();
  for (const c of classes) {
    for (const s of sessions) if (belongsToClass(s, c)) matched.add(String(s._id));
    for (const a of attendances) if (belongsToClass(a, c)) matched.add(String(a._id));
  }
  for (const s of sessions) {
    if (!matched.has(String(s._id))) {
      rows.push({ loai: 'buổi dạy', lop: `${s.className} (LỚP ĐÃ XOÁ)`, ngay: s.date,
        trangThai: STATUS_VI[s.status] || s.status, giangVien: s.teacherName || '',
        tien: 0, ky: '', id: String(s._id) });
    }
  }
  for (const a of attendances) {
    if (!matched.has(String(a._id))) {
      rows.push({ loai: 'điểm danh', lop: `${a.className} (LỚP ĐÃ XOÁ)`, ngay: a.date,
        trangThai: '', giangVien: '', tien: 0, ky: '', id: String(a._id) });
    }
  }

  rows.sort((x, y) => (x.lop + x.ngay).localeCompare(y.lop + y.ngay));
  if (rows.length) console.table(rows);

  const tienBuoiDay = rows.filter(r => r.loai === 'buổi dạy').reduce((s, r) => s + r.tien, 0);
  console.log(`\nTổng: ${rows.length} bản ghi mồ côi`);
  console.log(`  · buổi dạy:  ${rows.filter(r => r.loai === 'buổi dạy').length}  —  ${money(tienBuoiDay)}đ`);
  console.log(`  · điểm danh: ${rows.filter(r => r.loai === 'điểm danh').length}`);

  const paidPeriods = new Set(payments.map(p => String(p.periodStart || '').slice(0, 7)));
  const hit = [...new Set(rows.map(r => r.ky).filter(Boolean))].filter(p => paidPeriods.has(p)).sort();
  if (hit.length) console.log(`\n⚠️  Chạm vào kỳ ĐÃ ĐÁNH DẤU TRẢ LƯƠNG: ${hit.join(', ')}`);

  // Bản ghi từng là "dạy thay" rồi bị đổi trạng thái nhưng còn sót substituteRate: chuỗi
  // fallback đơn giá (utils/sessionPay.js) sẽ trả mức dạy thay đó cho giảng viên GỐC.
  // Controller nay tự dọn khi đổi trạng thái, nhưng dữ liệu cũ thì phải quét tay.
  const stale = sessions.filter(s => s.substituteRate != null && s.status !== 'substituted');
  if (stale.length) {
    console.log(`\n⚠️  ${stale.length} buổi còn sót "lương dạy thay" dù không còn là buổi dạy thay:`);
    console.table(stale.map(s => ({
      lop: s.className, ngay: s.date, trangThai: STATUS_VI[s.status] || s.status,
      luongDayThay: money(s.substituteRate), giangVien: s.teacherName || '', id: String(s._id),
    })));
    console.log('   → mức này đang được trả cho giảng viên GỐC. Xoá substituteRate của các bản ghi trên.');
  }

  if (reportPath) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`\nĐã lưu báo cáo: ${reportPath}`);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
