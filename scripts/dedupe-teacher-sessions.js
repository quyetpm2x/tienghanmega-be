// Dọn bản ghi buổi dạy giảng viên TRÙNG (cùng lớp + ngày): giữ bản nhập/sửa sau cùng (theo ngày
// tạo và lần dời lịch cuối — updatedAt đã bị script hàng loạt đè nên không dùng), xoá bản cũ.
// Kế hoạch thuần: src/utils/sessionDedupe.js. Script báo thêm chênh lệch lương so với cách cũ
// (lấy bản đầu tiên) để đối soát các kỳ đã trả.
//
//   Chạy thử (mặc định, KHÔNG ghi):  node scripts/dedupe-teacher-sessions.js --env-file=.env.development
//   Ghi thật (gõ đúng tên DB):       node scripts/dedupe-teacher-sessions.js --env-file=.env.development --apply
//   Lưu báo cáo JSON:                ... --report=backups/dedupe-teacher-sessions.json
// Khi ghi thật, bản đầy đủ của các bản ghi bị xoá được lưu vào <report>.removed.json (hoặc
// backups/dedupe-teacher-sessions-removed-<thời điểm>.json) để khôi phục nếu cần.
require('../src/config/timezone');   // PHẢI đứng trước mọi require khác
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const argValue = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argValue('env-file');
const apply = process.argv.includes('--apply');
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
const Teacher = require('../src/models/Teacher');
const TeacherSession = require('../src/models/TeacherSession');
const TeacherPayment = require('../src/models/TeacherPayment');
const PayrollSettings = require('../src/models/PayrollSettings');
const { buildSessionDedupePlan } = require('../src/utils/sessionDedupe');
const { payrollImpactByPeriod } = require('../src/utils/payrollImpact');
const { DEFAULT_PAY_PERIOD_START_DAY, todayDateStr } = require('../src/utils/teacherLedger');

const STATUS_VI = { taught: 'đã dạy', 'not-taught': 'không dạy', absent: 'vắng', rescheduled: 'dời lịch', substituted: 'dạy thay' };
const money = n => (n || 0).toLocaleString('vi-VN');
const when = s => (s.updatedAt ? new Date(s.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '?');
const desc = s => `${STATUS_VI[s.status] || s.status}${s.rescheduledDate ? ` → ${s.rescheduledDate}` : ''}${s.substituteTeacherName ? ` (thay: ${s.substituteTeacherName})` : ''} · sửa ${when(s)}`;

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const dbName = mongoose.connection.name;
  console.log(`Database đích: ${dbName}   ·   Chế độ: ${apply ? 'GHI THẬT' : 'CHẠY THỬ — không ghi gì'}`);
  const startDay = (await PayrollSettings.findOne().lean())?.startDay || DEFAULT_PAY_PERIOD_START_DAY;
  const [classes, sessions, teachers, payments] = await Promise.all([
    Class.find().select('name teacher teacherId days startDate endDate ratePerSession teacherAssignments').lean(),
    TeacherSession.find().lean(),
    Teacher.find().select('name').lean(),
    TeacherPayment.find().select('teacherId periodStart amountPaid').lean(),
  ]);
  console.log(`Nạp: ${classes.length} lớp · ${sessions.length} buổi dạy · ${teachers.length} giảng viên`);

  const plan = buildSessionDedupePlan({ classes, sessions });
  const conflicts = plan.groups.filter(g => g.statusConflict);
  console.log(`\nNgày có bản ghi trùng: ${plan.groups.length} (trong đó ${conflicts.length} ngày trạng thái MÂU THUẪN) · sẽ xoá ${plan.removeIds.length} bản ghi cũ`);
  for (const g of plan.groups) {
    console.log(`  • ${g.className} · ${g.date}${g.statusConflict ? ' ⚠ mâu thuẫn' : ''}`);
    console.log(`      GIỮ: ${desc(g.keep)}`);
    for (const r of g.remove) console.log(`      xoá: ${desc(r)}`);
  }

  const removeSet = new Set(plan.removeIds);
  const impact = payrollImpactByPeriod({
    teachers, classes, payments, startDay, todayStr: todayDateStr(),
    sessionsBefore: sessions, latestWinsBefore: false,
    sessionsAfter: sessions.filter(s => !removeSet.has(String(s._id))),
  });
  console.log(`\n💰 CHÊNH LỆCH LƯƠNG BUỔI DẠY — cách cũ (lấy bản đầu tiên) → sau khi dọn: ${impact.length} dòng giảng viên × kỳ`);
  for (const r of impact) {
    console.log(`  • ${r.teacherName} | ${r.period} | ${r.sessionsBefore} → ${r.sessionsAfter} buổi | ${money(r.before)}đ → ${money(r.after)}đ | ${r.diff > 0 ? '+' : ''}${money(r.diff)}đ | đã thanh toán ${r.paid ? money(r.paid) + 'đ' : 'chưa trả'}`);
  }
  if (!impact.length) console.log('  Không kỳ nào đổi số tiền.');

  if (reportPath) {
    fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify({
      database: dbName, mode: apply ? 'apply' : 'dry-run', generatedAt: new Date(), startDay,
      groups: plan.groups, removeIds: plan.removeIds, payrollImpact: impact,
    }, null, 2));
    console.log(`\nĐã lưu báo cáo: ${reportPath}`);
  }

  if (!apply || plan.removeIds.length === 0) {
    console.log(plan.removeIds.length === 0 ? '\nKhông có bản ghi trùng.' : '\nChạy thử xong. Không có gì được ghi.');
    await mongoose.disconnect();
    return;
  }

  const typed = await ask(`\n⚠️  Sắp XOÁ ${plan.removeIds.length} bản ghi buổi dạy trong database "${dbName}". Gõ đúng tên database để xác nhận: `);
  if (typed !== dbName) {
    console.error('Tên không khớp — huỷ, không ghi gì.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Lưu bản đầy đủ trước khi xoá — khôi phục bằng insertMany nếu cần.
  const removedDocs = sessions.filter(s => removeSet.has(String(s._id)));
  const backupFile = reportPath
    ? path.resolve(process.cwd(), reportPath.replace(/\.json$/, '') + '.removed.json')
    : path.resolve(process.cwd(), `backups/dedupe-teacher-sessions-removed-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.writeFileSync(backupFile, JSON.stringify(removedDocs, null, 2));
  console.log(`Đã lưu ${removedDocs.length} bản ghi sẽ xoá vào: ${path.relative(process.cwd(), backupFile)}`);

  const res = await TeacherSession.deleteMany({ _id: { $in: plan.removeIds.map(id => new mongoose.Types.ObjectId(id)) } });
  console.log(`Đã xoá ${res.deletedCount} bản ghi.`);

  const after = buildSessionDedupePlan({ classes, sessions: await TeacherSession.find().lean() });
  await mongoose.disconnect();
  if (after.groups.length) {
    console.error(`\n⛔ Kiểm chứng: vẫn còn ${after.groups.length} ngày có bản ghi trùng.`);
    process.exit(2);
  }
  console.log('\n✅ Không còn bản ghi buổi dạy trùng.');
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
