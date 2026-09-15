// Nối mọi bản ghi với lớp gốc theo classId (lớp ở trang Lớp học là gốc): điểm danh học sinh,
// buổi dạy giảng viên, thưởng/phạt, ghi danh — và đưa tên hiển thị về tên hiện tại của lớp.
// Kế hoạch thuần: src/utils/classNameSync.js (buildClassLinkPlan).
//
//   Chạy thử (mặc định, KHÔNG ghi):  node scripts/backfill-class-ids.js --env-file=.env.development
//   Ghi thật (gõ đúng tên DB):       node scripts/backfill-class-ids.js --env-file=.env.development --apply
//   Lưu báo cáo JSON:                ... --report=backups/backfill-class-ids.json
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
const Student = require('../src/models/Student');
const Enrollment = require('../src/models/Enrollment');
const StudentAttendance = require('../src/models/StudentAttendance');
const TeacherSession = require('../src/models/TeacherSession');
const TeacherBonus = require('../src/models/TeacherBonus');
const PayrollSettings = require('../src/models/PayrollSettings');
const Teacher = require('../src/models/Teacher');
const TeacherPayment = require('../src/models/TeacherPayment');
const { buildClassLinkPlan } = require('../src/utils/classNameSync');
const { payPeriodLabel, DEFAULT_PAY_PERIOD_START_DAY, todayDateStr } = require('../src/utils/teacherLedger');
const { payrollImpactByPeriod, applyLinkUpdates } = require('../src/utils/payrollImpact');

const STATUS_VI = { taught: 'đã dạy', 'not-taught': 'không dạy', absent: 'vắng', rescheduled: 'dời lịch', substituted: 'dạy thay' };

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function loadAll() {
  const [classes, students, enrollments, attendances, sessions, bonuses] = await Promise.all([
    Class.find().select('name').lean(),
    Student.find().select('classId className').lean(),
    Enrollment.find().select('classId className').lean(),
    StudentAttendance.find().select('classId className date').lean(),
    TeacherSession.find().select('classId className date status teacherName substituteTeacherId substituteTeacherName substituteRate').lean(),
    TeacherBonus.find().select('classId className').lean(),
  ]);
  return { classes, students, enrollments, attendances, sessions, bonuses };
}

const countBy = (list, key) => list.reduce((acc, x) => { acc[x[key]] = (acc[x[key]] || 0) + 1; return acc; }, {});

function printPlan(plan, startDay) {
  const reasons = list => Object.entries(countBy(list, 'reason')).map(([r, n]) => `${n} ${r}`).join(' · ') || '0';
  console.log('\nSẽ gắn classId / sửa tên hiển thị:');
  console.log(`  Buổi điểm danh: ${plan.attendanceUpdates.length} (${reasons(plan.attendanceUpdates)})`);
  console.log(`  Buổi dạy giảng viên: ${plan.sessionUpdates.length} (${reasons(plan.sessionUpdates)})`);
  console.log(`  Thưởng/phạt: ${plan.bonusUpdates.length} (${reasons(plan.bonusUpdates)})`);
  console.log(`  Ghi danh (tên lệch): ${plan.enrollmentUpdates.length}`);
  console.log('  (sameName = tên đã đúng, chỉ gắn classId — KHÔNG đổi lương · oldName = tên lớp cũ · nameDrift = đã có classId, sửa tên)');

  const oldNames = new Map();
  for (const u of [...plan.attendanceUpdates, ...plan.sessionUpdates, ...plan.bonusUpdates].filter(u => u.reason === 'oldName')) {
    const k = `${u.from} → ${u.className}`;
    oldNames.set(k, (oldNames.get(k) || 0) + 1);
  }
  console.log(`\nTên lớp cũ được nối về lớp gốc: ${oldNames.size}`);
  for (const [k, n] of oldNames) console.log(`  • ${k}: ${n} bản ghi`);

  console.log(`\n⚠️  ẢNH HƯỞNG LƯƠNG — buổi dạy đang mang tên cũ (hiện KHÔNG khớp lớp nào khi tính lương): ${plan.payrollImpact.length}`);
  const byStatus = countBy(plan.payrollImpact, 'status');
  console.log(`  Theo loại: ${Object.entries(byStatus).map(([s, n]) => `${n} ${STATUS_VI[s] || s}`).join(' · ') || '—'}`);
  console.log('  Ý nghĩa sau khi gắn: "vắng/không dạy" → buổi đó bị trừ khỏi lương theo lịch; "dạy thay" → lương chuyển sang người dạy thay; "dời lịch" → tính theo dời lịch; "đã dạy" → lương theo lịch không đổi.');
  const groups = new Map();
  for (const x of plan.payrollImpact) {
    const k = `${x.teacherName || '?'}|${payPeriodLabel(x.date, startDay)}|${x.to}`;
    if (!groups.has(k)) groups.set(k, {});
    const g = groups.get(k); g[x.status] = (g[x.status] || 0) + 1;
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (rows.length) console.log('  Giảng viên | kỳ lương | lớp | số buổi theo loại');
  for (const [k, g] of rows) {
    const [teacher, period, cls] = k.split('|');
    console.log(`  • ${teacher} | ${period} | ${cls} | ${Object.entries(g).map(([s, n]) => `${n} ${STATUS_VI[s] || s}`).join(', ')}`);
  }

  console.log(`\nXung đột điểm danh (lớp gốc đã có buổi cùng ngày — KHÔNG gắn, cần gộp tay): ${plan.conflicts.length}`);
  for (const c of plan.conflicts) console.log(`  • "${c.from}" ngày ${c.date} → lớp "${c.to}"`);
  console.log(`Tên cũ mơ hồ (KHÔNG gắn): ${plan.ambiguous.length}`);
  for (const a of plan.ambiguous) console.log(`  • "${a.name}" → ${a.classNames.join(' / ')}`);
  console.log(`Tên không khớp lớp nào (KHÔNG gắn — lớp đã xoá?): ${plan.unknown.length}`);
  for (const u of plan.unknown) console.log(`  • "${u.name}": ${u.attendances} điểm danh · ${u.sessions} buổi dạy · ${u.bonuses} thưởng/phạt`);
}

const money = n => (n || 0).toLocaleString('vi-VN');

// Chạy công thức tính lương thật trên dữ liệu hiện tại và dữ liệu sau khi gắn classId.
async function computeMoneyImpact(sessions, plan, startDay) {
  const [teachers, classes, payments] = await Promise.all([
    Teacher.find().select('name').lean(),
    Class.find().select('name teacher teacherId days startDate endDate ratePerSession teacherAssignments').lean(),
    TeacherPayment.find().select('teacherId periodStart amountPaid').lean(),
  ]);
  return payrollImpactByPeriod({
    teachers, classes, payments, startDay, todayStr: todayDateStr(),
    sessionsBefore: sessions, sessionsAfter: applyLinkUpdates(sessions, plan.sessionUpdates),
  });
}

function printMoneyImpact(rows) {
  console.log(`\n💰 CHÊNH LỆCH TIỀN LƯƠNG BUỔI DẠY (hiện tại → sau khi gắn classId): ${rows.length} dòng giảng viên × kỳ`);
  if (!rows.length) { console.log('  Không có kỳ lương nào đổi số tiền.'); return; }
  console.log('  Giảng viên | kỳ lương | buổi được trả | lương buổi dạy hiện tại → sau | chênh lệch | đã thanh toán kỳ này');
  const byTeacher = new Map();
  for (const r of rows) {
    console.log(`  • ${r.teacherName} | ${r.period} | ${r.sessionsBefore} → ${r.sessionsAfter} | ${money(r.before)}đ → ${money(r.after)}đ | ${r.diff > 0 ? '+' : ''}${money(r.diff)}đ | ${r.paid ? money(r.paid) + 'đ' : 'chưa trả'}`);
    const t = byTeacher.get(r.teacherName) || { diff: 0, paidPeriods: 0, diffPaid: 0 };
    t.diff += r.diff;
    if (r.paid) { t.paidPeriods += 1; t.diffPaid += r.diff; }
    byTeacher.set(r.teacherName, t);
  }
  console.log('\n  Tổng theo giảng viên:');
  let total = 0, totalPaid = 0;
  for (const [name, t] of byTeacher) {
    total += t.diff; totalPaid += t.diffPaid;
    console.log(`  • ${name}: ${t.diff > 0 ? '+' : ''}${money(t.diff)}đ (trong đó ${t.paidPeriods} kỳ đã thanh toán: ${t.diffPaid > 0 ? '+' : ''}${money(t.diffPaid)}đ)`);
  }
  console.log(`  TỔNG: ${total > 0 ? '+' : ''}${money(total)}đ · riêng các kỳ đã thanh toán: ${totalPaid > 0 ? '+' : ''}${money(totalPaid)}đ`);
}

async function applyUpdates(Model, updates) {
  // Mỗi bản ghi đổi đúng giá trị đã lập kế hoạch; chỉ ghi nếu tên trên bản ghi vẫn như lúc lập
  // (có ai vừa sửa thì bỏ qua, lần chạy sau sẽ tính lại).
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await Model.bulkWrite(chunk.map(u => ({
      updateOne: {
        filter: { _id: u._id, className: u.from },
        update: { $set: { classId: new mongoose.Types.ObjectId(u.classId), className: u.className } },
      },
    })));
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const dbName = mongoose.connection.name;
  console.log(`Database đích: ${dbName}   ·   Chế độ: ${apply ? 'GHI THẬT' : 'CHẠY THỬ — không ghi gì'}`);
  const settings = await PayrollSettings.findOne().lean();
  const startDay = (settings && settings.startDay) || DEFAULT_PAY_PERIOD_START_DAY;

  const data = await loadAll();
  console.log(`Nạp: ${data.classes.length} lớp · ${data.students.length} học sinh · ${data.attendances.length} điểm danh · ${data.sessions.length} buổi dạy · ${data.bonuses.length} thưởng/phạt · ${data.enrollments.length} ghi danh · kỳ lương bắt đầu ngày ${startDay}`);
  const plan = buildClassLinkPlan(data);
  printPlan(plan, startDay);
  const moneyImpact = await computeMoneyImpact(data.sessions, plan, startDay);
  printMoneyImpact(moneyImpact);

  if (reportPath) {
    fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify({
      database: dbName, mode: apply ? 'apply' : 'dry-run', generatedAt: new Date(), startDay, moneyImpact, plan,
    }, null, 2));
    console.log(`\nĐã lưu báo cáo: ${reportPath}`);
  }

  const work = plan.attendanceUpdates.length + plan.sessionUpdates.length + plan.bonusUpdates.length + plan.enrollmentUpdates.length;
  if (!apply || work === 0) {
    console.log(work === 0 ? '\nKhông có gì cần gắn.' : '\nChạy thử xong. Không có gì được ghi.');
    await mongoose.disconnect();
    return;
  }

  const typed = await ask(`\n⚠️  Sắp GHI ${work} bản ghi vào database "${dbName}". Gõ đúng tên database để xác nhận: `);
  if (typed !== dbName) {
    console.error('Tên không khớp — huỷ, không ghi gì.');
    await mongoose.disconnect();
    process.exit(1);
  }

  await applyUpdates(StudentAttendance, plan.attendanceUpdates);
  await applyUpdates(TeacherSession, plan.sessionUpdates);
  await applyUpdates(TeacherBonus, plan.bonusUpdates);
  await applyUpdates(Enrollment, plan.enrollmentUpdates);
  console.log(`\nĐã ghi ${work} bản ghi.`);

  const after = buildClassLinkPlan(await loadAll());
  const left = after.attendanceUpdates.length + after.sessionUpdates.length + after.bonusUpdates.length + after.enrollmentUpdates.length;
  await mongoose.disconnect();
  if (left) {
    console.error(`\n⛔ Kiểm chứng: vẫn còn ${left} bản ghi chưa nối theo classId.`);
    process.exit(2);
  }
  console.log(`\n✅ Mọi bản ghi xác định được đã nối theo classId. Còn lại cần xử lý tay: ${after.conflicts.length} xung đột · ${after.ambiguous.length} mơ hồ · ${after.unknown.length} tên không rõ.`);
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
