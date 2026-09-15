// Chuyển đổi học sinh "một lớp — một học phí" sang EnrollmentPackage + Enrollment.
//
//   Chạy thử (mặc định, KHÔNG ghi gì):
//     node scripts/migrate-enrollments.js --env-file=.env.development
//   Ghi thật (hỏi gõ đúng tên database trước khi ghi):
//     node scripts/migrate-enrollments.js --env-file=.env.development --apply
//   Lưu báo cáo JSON:
//     ... --report=backups/migrate-report.json
//
// An toàn:
//  • Bắt buộc --env-file: không có file mặc định, tránh chạy nhầm database.
//  • Bất biến (checkPlan) không đạt thì dừng, không ghi.
//  • Idempotent: học sinh đã có bất kỳ gói nào thì bỏ qua; kiểm lại trong transaction.
//  • Mỗi học sinh ghi trong một transaction. Không sửa/xoá trường cũ trên Student.
//  • Sau khi ghi, đọc lại database và kiểm chứng lần nữa.
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
const Student = require('../src/models/Student');
const Payment = require('../src/models/Payment');
const Class = require('../src/models/Class');
const EnrollmentPackage = require('../src/models/EnrollmentPackage');
const Enrollment = require('../src/models/Enrollment');
const ReferralCommission = require('../src/models/ReferralCommission');
const {
  buildMigrationPlan, checkPlan, legacyMonthly, planMonthly, compareMonthly, explainDelta,
} = require('../src/utils/migrationMapping');
const { packageFacts, aggregateByMonth } = require('../src/utils/revenueModel');

const money = n => (n || 0).toLocaleString('vi-VN');
const LEGACY_KEYS = ['classId', 'className', 'level', 'startDate', 'status', 'tuitionStatus', 'amount', 'coursePrice'];
const legacySnapshot = students => JSON.stringify(
  students.map(s => [String(s._id), ...LEGACY_KEYS.map(k => (s[k] === undefined ? null : String(s[k])))])
    .sort((a, b) => a[0].localeCompare(b[0])),
);

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function printChecks(title, checks) {
  console.log(`\n${title}`);
  for (const c of checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
}

function printComparison(rows, delta) {
  console.log('\nDoanh thu theo tháng — quy tắc cũ vs mới:');
  console.log('  THÁNG    | DOANH THU CŨ   | DOANH THU MỚI  | CHÊNH          | ĐÃ ĐÓNG CŨ     | ĐÃ ĐÓNG MỚI');
  for (const r of rows) {
    const mark = r.diffRevenue || r.diffCollected ? ' ⚠' : '';
    console.log(`  ${r.month}  | ${money(r.legacyRevenue).padStart(14)} | ${money(r.newRevenue).padStart(14)} | ${money(r.diffRevenue).padStart(14)} | ${money(r.legacyCollected).padStart(14)} | ${money(r.newCollected).padStart(14)}${mark}`);
  }
  console.log(`\nHọc sinh CHỈ được tính ở quy tắc mới (nguồn chênh lệch hợp lệ duy nhất): ${delta.length}`);
  for (const d of delta) console.log(`  • ${d.name} — ${d.reason} — ${money(d.contract)}đ`);
}

async function verifyAfterApply(before) {
  const [students, payments, packages, enrollments, commissions] = await Promise.all([
    Student.find().lean(),
    Payment.find().lean(),
    EnrollmentPackage.find().lean(),
    Enrollment.find().lean(),
    ReferralCommission.countDocuments(),
  ]);
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });

  add('Số học sinh không đổi', students.length === before.students.length, `${before.students.length} → ${students.length}`);
  add('Số khoản thu không đổi', payments.length === before.payments.length, `${before.payments.length} → ${payments.length}`);
  add('Số hoa hồng không đổi', commissions === before.commissions, `${before.commissions} → ${commissions}`);
  add('Trường cũ trên học sinh không bị sửa', legacySnapshot(students) === before.legacySnapshot);

  const pkgStudents = new Set(packages.map(p => String(p.studentId)));
  const missing = students.filter(s => !pkgStudents.has(String(s._id)));
  add('Mọi học sinh đều có gói', missing.length === 0, missing.map(s => s.name).slice(0, 10).join(', '));

  const studentIds = new Set(students.map(s => String(s._id)));
  const unlinked = payments.filter(p => studentIds.has(String(p.studentId)) && !p.packageId);
  add('Khoản thu của học sinh còn tồn tại đều có packageId', unlinked.length === 0, `${unlinked.length} khoản chưa gắn`);

  const payByPkg = new Map();
  for (const p of payments) if (p.packageId) payByPkg.set(String(p.packageId), (payByPkg.get(String(p.packageId)) || 0) + p.amount);
  const migratedPkgs = packages.filter(p => p.migratedAt);
  const wrongPaid = migratedPkgs.filter(p => (payByPkg.get(String(p._id)) || 0) + p.paidAdjustment !== (p.legacy?.amount || 0));
  add('Gói chuyển đổi: Σ khoản thu + điều chỉnh = số đã nộp cũ', wrongPaid.length === 0, `${wrongPaid.length} gói lệch`);

  const enrByPkg = new Map();
  for (const e of enrollments) {
    const k = String(e.packageId);
    if (!enrByPkg.has(k)) enrByPkg.set(k, []);
    enrByPkg.get(k).push(e);
  }
  const wrongShape = packages.filter(p => {
    const es = enrByPkg.get(String(p._id)) || [];
    return es.length === 0
      || es.reduce((s, e) => s + e.listPrice, 0) !== p.listTotal
      || es.reduce((s, e) => s + e.discountShare, 0) !== p.discount
      || es.reduce((s, e) => s + e.netPrice, 0) !== p.netTotal;
  });
  add('Mọi gói: Σ giá ghi danh khớp tổng gói', wrongShape.length === 0, `${wrongShape.length} gói lệch`);

  for (const p of packages) p.enrollments = enrByPkg.get(String(p._id)) || [];
  // Chỉ so các gói của lần chạy này — lần chạy lại (bỏ qua học sinh đã có gói) không bị
  // báo lệch giả vì gói cũ không nằm trong kế hoạch.
  const runPackages = packages.filter(p => before.planStudentIds.has(String(p.studentId)));
  const dbMonthly = aggregateByMonth(runPackages, packageFacts(runPackages, payments.filter(p => p.packageId)), {});
  const planRows = compareMonthly(before.planMonthly, Object.fromEntries(
    Object.entries(dbMonthly).map(([k, v]) => [k, { revenue: v.revenue, collected: v.collected }])));
  const drift = planRows.filter(r => r.diffRevenue || r.diffCollected);
  add('Doanh thu đọc từ database = doanh thu tính trên kế hoạch', drift.length === 0, drift.map(r => r.month).join(', '));
  return checks;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const dbName = mongoose.connection.name;
  console.log(`Database đích: ${dbName}   ·   Chế độ: ${apply ? 'GHI THẬT' : 'CHẠY THỬ — không ghi gì'}`);

  const [students, payments, classes, studentsWithPackage, commissions] = await Promise.all([
    Student.find().lean(),
    Payment.find().lean(),
    Class.find().select('name course').lean(),
    EnrollmentPackage.distinct('studentId'),
    ReferralCommission.countDocuments(),
  ]);
  console.log(`Nạp: ${students.length} học sinh · ${payments.length} khoản thu · ${classes.length} lớp · ${studentsWithPackage.length} học sinh đã có gói`);

  const plan = buildMigrationPlan({ students, payments, classes, skipStudentIds: studentsWithPackage });
  const checks = checkPlan(plan, { students, payments });
  const legacy = legacyMonthly(students, payments);
  const fresh = planMonthly(plan, payments);
  const rows = compareMonthly(legacy, fresh);
  const delta = explainDelta(students, payments);

  console.log(`\nKế hoạch: ${plan.items.length} học sinh chuyển đổi · ${plan.skipped.length} bỏ qua · ${plan.orphanPayments.length} khoản thu mồ côi (không sửa)`);
  console.log(`Σ học phí gói: ${money(plan.items.reduce((s, it) => s + it.package.netTotal, 0))}đ`);
  const warned = plan.items.filter(it => it.warnings.length);
  console.log(`\nCảnh báo cần admin xem lại: ${warned.length} học sinh`);
  for (const it of warned) console.log(`  • ${it.name}: ${it.warnings.join('; ')}`);
  for (const p of plan.orphanPayments) console.log(`  • Khoản thu mồ côi ${p._id}: ${money(p.amount)}đ (học sinh ${p.studentId} không tồn tại)`);
  printChecks('Bất biến trên kế hoạch:', checks);
  printComparison(rows, delta);

  if (reportPath) {
    fs.writeFileSync(path.resolve(process.cwd(), reportPath), JSON.stringify({
      database: dbName, mode: apply ? 'apply' : 'dry-run', generatedAt: new Date(),
      counts: { students: students.length, payments: payments.length, items: plan.items.length, skipped: plan.skipped.length, orphanPayments: plan.orphanPayments.length },
      checks, monthly: rows, delta,
      warnings: warned.map(it => ({ studentId: it.studentId, name: it.name, warnings: it.warnings })),
    }, null, 2));
    console.log(`\nĐã lưu báo cáo: ${reportPath}`);
  }

  if (checks.some(c => !c.ok)) {
    console.error('\n⛔ Bất biến không đạt — dừng, KHÔNG ghi gì.');
    await mongoose.disconnect();
    process.exit(2);
  }
  if (!apply) {
    console.log('\nChạy thử xong. Không có gì được ghi.');
    await mongoose.disconnect();
    return;
  }

  const typed = await ask(`\n⚠️  Sắp GHI vào database "${dbName}". Gõ đúng tên database để xác nhận: `);
  if (typed !== dbName) {
    console.error('Tên không khớp — huỷ, không ghi gì.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const before = {
    students, payments, commissions, legacySnapshot: legacySnapshot(students), planMonthly: fresh,
    planStudentIds: new Set(plan.items.map(it => it.studentId)),
  };
  const migratedAt = new Date();
  let written = 0;
  for (const it of plan.items) {
    await mongoose.connection.transaction(async session => {
      // Kiểm lại trong transaction: không nhân đôi nếu có ai vừa tạo gói cho học sinh này.
      if (await EnrollmentPackage.exists({ studentId: it.package.studentId }).session(session)) return;
      const [pkg] = await EnrollmentPackage.create([{ ...it.package, migratedAt }], { session });
      await Enrollment.create([{ ...it.enrollment, packageId: pkg._id }], { session });
      if (it.paymentIds.length) {
        await Payment.updateMany(
          { _id: { $in: it.paymentIds }, packageId: { $in: [null] } },
          { $set: { packageId: pkg._id } },
        ).session(session);
      }
      await Student.updateOne({ _id: it.package.studentId }, { $set: { statusManual: false } }).session(session);
    });
    written++;
    if (written % 50 === 0) console.log(`  ... đã ghi ${written}/${plan.items.length}`);
  }
  console.log(`\nĐã ghi ${written} học sinh.`);

  const after = await verifyAfterApply(before);
  printChecks('Kiểm chứng sau khi ghi (đọc lại từ database):', after);
  await mongoose.disconnect();
  if (after.some(c => !c.ok)) {
    console.error('\n⛔ Kiểm chứng sau khi ghi KHÔNG đạt — cần xem xét, cân nhắc khôi phục bản sao lưu.');
    process.exit(2);
  }
  console.log('\n✅ Chuyển đổi hoàn tất và đã kiểm chứng.');
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
