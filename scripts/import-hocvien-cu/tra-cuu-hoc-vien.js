// CHỈ ĐỌC. Tra một học viên theo tên: hiện trạng trong DB + đối chiếu với backup.
//   node ... tra-cuu-hoc-vien.js "Nguyễn Mộng Tài"
// Tìm theo kiểu CHỨA và bỏ dấu, để gõ thiếu dấu vẫn ra — khác quy tắc khớp lúc import
// (khớp chính xác); ở đây mục đích là tìm cho ra người, không phải quyết định gộp.
const path = require('path');
const { execFileSync } = require('child_process');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { paymentState } = require(path.join(BE, 'src/utils/packageMath'));
const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));

const TEN = process.argv[2] || '';
const BK = path.join(BE, 'backups/2026-09-19_00-49/tienghanmega_product');
const money = n => (n || 0).toLocaleString('vi-VN') + 'đ';
const bo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const hop = n => bo(n).includes(bo(TEN)) || bo(TEN).includes(bo(n));
const num = v => !v ? 0 : (typeof v === 'object' ? Number(v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? 0) : Number(v));
const oid = v => (v && typeof v === 'object' && v.$oid) ? v.$oid : String(v);
const bson = n => execFileSync('bsondump', ['--quiet', `${BK}/${n}.bson`], { maxBuffer: 1 << 28 })
  .toString().split('\n').filter(Boolean).map(l => JSON.parse(l));

(async () => {
  if (!TEN) { console.error('Thiếu tên. Ví dụ: node ... "Nguyễn Mộng Tài"'); process.exit(1); }
  console.log(`Tìm: "${TEN}"\n`);

  // ── BACKUP (đọc file) ──
  const bS = bson('students').filter(s => hop(s.name));
  console.log('═'.repeat(72));
  console.log(`BACKUP 2026-09-19_00-49 (trước import) — ${bS.length} hồ sơ khớp`);
  console.log('═'.repeat(72));
  if (bS.length) {
    const ids = new Set(bS.map(s => oid(s._id)));
    const bP = bson('enrollmentpackages').filter(p => ids.has(oid(p.studentId)));
    const bY = bson('payments').filter(p => ids.has(oid(p.studentId)));
    const bE = bson('enrollments').filter(e => ids.has(oid(e.studentId)));
    for (const s of bS) {
      const sid = oid(s._id);
      console.log(`\n  ${s.name}   SĐT: ${s.phone || '—'}   (id ${sid})`);
      for (const p of bP.filter(x => oid(x.studentId) === sid)) {
        const pid = oid(p._id);
        const pt = bY.filter(y => oid(y.packageId) === pid).reduce((a, y) => a + num(y.amount), 0);
        const st = paymentState({ netTotal: num(p.netTotal), paymentsTotal: pt, paidAdjustment: num(p.paidAdjustment) });
        const cls = bE.filter(e => oid(e.packageId) === pid).map(e => e.className || e.courseTitle).join(' + ');
        console.log(`     Gói: học phí ${money(num(p.netTotal))} · đã đóng ${money(st.paid)} · CÒN NỢ ${money(st.debt)}`);
        console.log(`          ${cls || '(chưa có lớp)'} · nhập tay ${money(num(p.paidAdjustment))} · ${bY.filter(y => oid(y.packageId) === pid).length} khoản thu`);
      }
    }
  }

  // ── HIỆN TẠI ──
  await mongoose.connect(process.env.MONGODB_URI);
  const cS = (await Student.find().select('name phone createdAt').lean()).filter(s => hop(s.name));
  console.log('\n' + '═'.repeat(72));
  console.log(`HIỆN TẠI — ${cS.length} hồ sơ khớp`);
  console.log('═'.repeat(72));
  const ids = cS.map(s => s._id);
  const [cP, cY, cE] = await Promise.all([
    EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId netTotal paidAdjustment registeredAt note').lean(),
    Payment.find({ studentId: { $in: ids } }).select('studentId packageId amount paidAt note').lean(),
    Enrollment.find({ studentId: { $in: ids } }).select('studentId packageId className courseTitle status').lean(),
  ]);
  for (const s of cS) {
    console.log(`\n  ${s.name}   SĐT: ${s.phone || '—'}   tạo ${String(s.createdAt).slice(0, 10)}   (id ${s._id})`);
    const my = cP.filter(p => String(p.studentId) === String(s._id));
    if (!my.length) console.log('     (không có gói đăng ký)');
    for (const p of my) {
      const pays = cY.filter(y => String(y.packageId) === String(p._id));
      const st = paymentState({ netTotal: p.netTotal, paymentsTotal: pays.reduce((a, y) => a + (y.amount || 0), 0), paidAdjustment: p.paidAdjustment });
      const cls = cE.filter(e => String(e.packageId) === String(p._id)).map(e => `${e.className || e.courseTitle} (${e.status})`).join(' + ');
      console.log(`     Gói: học phí ${money(p.netTotal)} · đã đóng ${money(st.paid)} · CÒN NỢ ${money(st.debt)}`);
      console.log(`          ${cls || '(chưa có lớp)'} · đăng ký ${p.registeredAt || '—'} · ghi chú "${p.note || ''}"`);
      for (const y of pays) console.log(`          ↳ thu ${money(y.amount)} ngày ${String(y.paidAt).slice(0, 10)} · "${y.note || ''}"`);
      if (p.paidAdjustment) console.log(`          ↳ nhập tay ${money(p.paidAdjustment)}`);
    }
  }
  await mongoose.disconnect();
  console.log('\nĐã ngắt kết nối. KHÔNG có thao tác ghi nào.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
