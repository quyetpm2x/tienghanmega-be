// Xoá học viên CHƯA ĐÓNG ĐỒNG NÀO (và toàn bộ gói/ghi danh/khoản thu của họ).
//   node ... xoa-chua-dong.js            → chạy thử, liệt kê, không xoá
//   node ... xoa-chua-dong.js --apply    → xoá thật
//
// CHẶN AN TOÀN: gói có netTotal = 0 thì paymentState luôn trả paid = 0, kể cả khi học viên
// ĐÃ có khoản thu thật. Nếu chỉ nhìn "đã đóng = 0" mà xoá thì có thể xoá nhầm tiền thật.
// Nên script kiểm riêng tổng Payment của từng em; em nào có tiền thật sẽ bị LOẠI khỏi danh sách.
const path = require('path');
const fs = require('fs');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { paymentState } = require(path.join(BE, 'src/utils/packageMath'));
const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));

const APPLY = process.argv.includes('--apply');
const LOG = '/Users/quyet.nv1209/Downloads/xoa-hoc-vien-chua-dong-log.json';
const money = n => (n || 0).toLocaleString('vi-VN') + 'đ';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  XOÁ THẬT' : 'CHẠY THỬ (không xoá)'}\n`);
  const [students, pkgs, enrs, pays] = await Promise.all([
    Student.find().select('name phone createdAt').lean(),
    EnrollmentPackage.find().select('studentId netTotal paidAdjustment').lean(),
    Enrollment.find().select('studentId className courseTitle').lean(),
    Payment.find().select('studentId packageId amount').lean(),
  ]);
  const by = arr => arr.reduce((a, x) => { (a[x.studentId] ||= []).push(x); return a; }, {});
  const P = by(pkgs), E = by(enrs), Y = by(pays);

  const del = [], guard = [];
  for (const s of students) {
    const id = String(s._id);
    const my = P[id] || [];
    const paid = my.reduce((a, p) => {
      const pt = (Y[id] || []).filter(x => String(x.packageId) === String(p._id)).reduce((t, x) => t + (x.amount || 0), 0);
      return a + paymentState({ netTotal: p.netTotal, paymentsTotal: pt, paidAdjustment: p.paidAdjustment }).paid;
    }, 0);
    if (paid > 0) continue;
    const tienThat = (Y[id] || []).reduce((a, x) => a + (x.amount || 0), 0);
    const row = { s, nPkg: my.length, fee: my.reduce((a, p) => a + (p.netTotal || 0), 0), tienThat,
      cls: [...new Set((E[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))].join(' + ') };
    // Có bản ghi thanh toán thật dù "đã đóng" hiện 0 → KHÔNG xoá, báo để xử tay.
    (tienThat > 0 ? guard : del).push(row);
  }

  console.log(`Sẽ xoá: ${del.length} học viên`);
  console.log(`  Tổng gói đăng ký kèm theo : ${del.reduce((a, x) => a + x.nPkg, 0)}`);
  console.log(`  Tổng công nợ bị xoá sổ    : ${money(del.reduce((a, x) => a + x.fee, 0))}\n`);
  console.log('  ' + 'HỌ TÊN'.padEnd(24) + 'SĐT'.padEnd(26) + 'HỌC PHÍ'.padStart(12) + '  LỚP');
  for (const x of del) console.log('  ' + x.s.name.padEnd(24) + String(x.s.phone || '—').padEnd(26) + money(x.fee).padStart(12) + '  ' + (x.cls || '(chưa có lớp)'));
  if (guard.length) {
    console.log(`\n🛡️  LOẠI KHỎI DANH SÁCH — ${guard.length} em có khoản thu thật dù "đã đóng" hiện 0đ (gói giá 0):`);
    for (const x of guard) console.log(`     ${x.s.name.padEnd(24)} có ${money(x.tienThat)} trong bản ghi thanh toán · ${x.cls}`);
  }

  if (!APPLY) { console.log('\n✋ CHẠY THỬ — chưa xoá gì. Thêm --apply để xoá thật.'); await mongoose.disconnect(); return; }

  const ids = del.map(x => x.s._id);
  const pkgIds = pkgs.filter(p => ids.some(i => String(i) === String(p.studentId))).map(p => p._id);
  fs.writeFileSync(LOG, JSON.stringify({ at: new Date().toISOString(),
    students: del.map(x => ({ id: String(x.s._id), name: x.s.name, phone: x.s.phone, fee: x.fee, cls: x.cls })),
    packageIds: pkgIds.map(String), guarded: guard.map(x => ({ name: x.s.name, tienThat: x.tienThat })) }, null, 2), 'utf8');
  await Payment.deleteMany({ studentId: { $in: ids } });
  await Enrollment.deleteMany({ studentId: { $in: ids } });
  await EnrollmentPackage.deleteMany({ studentId: { $in: ids } });
  await Student.deleteMany({ _id: { $in: ids } });
  console.log(`\n✅ Đã xoá ${ids.length} học viên và ${pkgIds.length} gói. Nhật ký: ${LOG}`);
  await mongoose.disconnect();
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
