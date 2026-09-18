require('../src/config/timezone');   // PHẢI đứng trước mọi require khác
// Quét bản ghi buổi dạy TRÙNG (cùng lớp + cùng ngày). CHỈ ĐỌC, không ghi gì.
//
// Vì sao cần: latestPerClassDate chỉ giữ bản "sửa sau cùng" cho mỗi (lớp, ngày). Khi hai
// bản HOÀ mốc sửa, bản thắng phụ thuộc thứ tự mảng — mà backend lấy bản ghi KHÔNG sort còn
// frontend nhận bản đã sort theo ngày, nên hai bên có thể chọn hai bản khác nhau và ra hai
// con số lương khác nhau.
//
// Chỉ nhóm "hoà mốc sửa" mới bị ảnh hưởng bởi việc sửa tie-break. Nhóm nào có mốc sửa khác
// nhau thì bản thắng đã xác định sẵn, đổi tie-break không đụng tới.
//
//   node scripts/find-duplicate-sessions.js --env-file=.env.development
const path = require('path');

const argValue = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argValue('env-file');
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
const { belongsToClass } = require('../src/utils/classLink');
const { editedAt, todayDateStr } = require('../src/utils/teacherLedger');
const { resolveSession } = require('../src/utils/sessionPay');
const { teacherIdOnDate } = require('../src/utils/classAssignment');

const STATUS_VI = { taught: 'đã dạy', 'not-taught': 'không dạy', absent: 'vắng', rescheduled: 'dời lịch', substituted: 'dạy thay' };
const money = n => (n || 0).toLocaleString('vi-VN');
const when = ms => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '?');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log(`Database đích: ${mongoose.connection.name}   ·   Chế độ: CHỈ ĐỌC\n`);

  const [classes, sessions] = await Promise.all([Class.find().lean(), TeacherSession.find().lean()]);

  // Khoá nhóm giống hệt latestPerClassDate: theo LỚP GỐC, bản ghi cũ chưa có classId thì theo tên.
  const groups = new Map();
  for (const s of sessions) {
    const cls = classes.find(c => belongsToClass(s, c));
    const key = `${cls ? cls._id : `name:${s.className}`}__${s.date}`;
    if (!groups.has(key)) groups.set(key, { cls, date: s.date, rows: [] });
    groups.get(key).rows.push(s);
  }

  const dups = [...groups.values()].filter(g => g.rows.length > 1);
  let tiedGroups = 0;

  for (const g of dups) {
    const top = Math.max(...g.rows.map(editedAt));
    const tied = g.rows.filter(s => editedAt(s) === top);
    const isTied = tied.length > 1;
    if (isTied) tiedGroups++;

    console.log(`\n${g.cls ? g.cls.name : `${g.rows[0].className} (LỚP ĐÃ XOÁ)`}  ·  ${g.date}  ·  ${g.rows.length} bản${isTied ? '   ⚠️  HOÀ MỐC SỬA' : ''}`);
    console.table(g.rows
      .sort((a, b) => editedAt(b) - editedAt(a))
      .map(s => {
        const r = g.cls ? resolveSession(g.cls, s, teacherIdOnDate(g.cls, s.date)) : { rate: null };
        return {
          trangThai: STATUS_VI[s.status] || s.status,
          sua: when(editedAt(s)),
          thang: editedAt(s) === top ? (isTied ? 'HOÀ' : '✓') : '',
          tien: r.rate == null ? '?' : money(r.rate),
          id: String(s._id),
        };
      }));

    if (isTied) {
      const amounts = new Set(tied.map(s => {
        const r = g.cls ? resolveSession(g.cls, s, teacherIdOnDate(g.cls, s.date)) : { rate: null };
        return `${s.status}|${r.rate}`;
      }));
      console.log(amounts.size > 1
        ? '   ⛔ các bản hoà nhau KHÁC trạng thái/số tiền — sửa tie-break SẼ đổi kết quả nhóm này'
        : '   ✅ các bản hoà nhau giống hệt nhau về trạng thái và số tiền — đổi tie-break không đổi số');
    }
  }

  console.log(`\n${dups.length} nhóm (lớp, ngày) có bản ghi trùng · ${tiedGroups} nhóm HOÀ MỐC SỬA`);
  console.log(tiedGroups === 0
    ? '✅ Không nhóm nào hoà mốc sửa → sửa tie-break không làm đổi một đồng nào của dữ liệu hiện có.'
    : '⚠️  Có nhóm hoà mốc sửa → đọc kỹ bảng trên trước khi đổi tie-break.');
  console.log(`Tổng ${sessions.length} bản ghi buổi dạy, ${classes.length} lớp, tính tới ${todayDateStr()}.`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
