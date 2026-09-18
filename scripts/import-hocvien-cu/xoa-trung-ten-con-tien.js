// Xoá 9 hồ sơ CŨ trùng tên 100% với dòng trong file Excel — chủ trung tâm chốt: trùng tên
// hoàn toàn thì chỉ giữ bản dựng từ Excel.
//   node ... xoa-trung-ten-con-tien.js            → chạy thử
//   node ... xoa-trung-ten-con-tien.js --apply    → xoá thật
//
// Danh sách ID lấy từ nhật ký import, KHÔNG tính lại theo tên — tính lại sau khi dữ liệu đã
// đổi có thể vớ nhầm hồ sơ khác.
const path = require('path');
const fs = require('fs');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));
const { paymentState } = require(path.join(BE, 'src/utils/packageMath'));

const APPLY = process.argv.includes('--apply');
const IMPORT_LOG = '/Users/quyet.nv1209/Downloads/import-hocvien-cu-log.json';
const LOG = '/Users/quyet.nv1209/Downloads/xoa-trung-ten-log.json';
const money = n => (n || 0).toLocaleString('vi-VN') + 'đ';

(async () => {
  const kept = JSON.parse(fs.readFileSync(IMPORT_LOG, 'utf8')).keptOldWithMoney || [];
  const ids = kept.map(k => new mongoose.Types.ObjectId(k.id));
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  XOÁ THẬT' : 'CHẠY THỬ (không xoá)'}\n`);

  // Đọc lại tình trạng HIỆN TẠI, không tin số liệu lúc import.
  const [stus, pkgs, enrs, pays] = await Promise.all([
    Student.find({ _id: { $in: ids } }).select('name phone').lean(),
    EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId netTotal paidAdjustment').lean(),
    Enrollment.find({ studentId: { $in: ids } }).select('studentId className courseTitle').lean(),
    Payment.find({ studentId: { $in: ids } }).select('studentId packageId amount').lean(),
  ]);
  const by = a => a.reduce((x, y) => { (x[y.studentId] ||= []).push(y); return x; }, {});
  const P = by(pkgs), E = by(enrs), Y = by(pays);
  // Tiền đã đóng = Payment CỘNG paidAdjustment (tiền nhập tay). Bản trước chỉ cộng Payment
  // nên báo 2,99tr trong khi thực tế ~30tr — phần lớn tiền của hồ sơ cũ nằm ở paidAdjustment.
  const paidOf = id => (P[id] || []).reduce((a, pk) => {
    const pt = (Y[id] || []).filter(x => String(x.packageId) === String(pk._id)).reduce((t, x) => t + (x.amount || 0), 0);
    return a + paymentState({ netTotal: pk.netTotal, paymentsTotal: pt, paidAdjustment: pk.paidAdjustment }).paid;
  }, 0);
  const missing = kept.filter(k => !stus.some(s => String(s._id) === k.id));

  console.log(`Hồ sơ còn tồn tại: ${stus.length}/${kept.length}` + (missing.length ? `  (${missing.length} đã bị xoá trước đó: ${missing.map(m => m.name).join(', ')})` : ''));
  console.log('\n  ' + 'HỌ TÊN'.padEnd(14) + 'SĐT'.padEnd(14) + 'GÓI'.padStart(4) + 'THU'.padStart(5) + 'TIỀN'.padStart(14) + '  LỚP');
  let total = 0;
  for (const s of stus) {
    const id = String(s._id);
    const paid = paidOf(id);
    total += paid;
    console.log('  ' + s.name.padEnd(14) + String(s.phone || '—').padEnd(14) + String((P[id] || []).length).padStart(4)
      + String((Y[id] || []).length).padStart(5) + money(paid).padStart(14) + '  '
      + [...new Set((E[id] || []).map(e => e.className || e.courseTitle))].join(' + '));
  }
  console.log(`\n  Tổng tiền sẽ xoá sổ: ${money(total)}`);

  if (!APPLY) { console.log('\n✋ CHẠY THỬ — chưa xoá gì. Thêm --apply để xoá thật.'); await mongoose.disconnect(); return; }

  fs.writeFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), deleted: stus.map(s => {
    const id = String(s._id);
    return { id, name: s.name, phone: s.phone,
      paid: paidOf(id),
      classes: [...new Set((E[id] || []).map(e => e.className || e.courseTitle))] };
  }) }, null, 2), 'utf8');
  const delIds = stus.map(s => s._id);
  await Payment.deleteMany({ studentId: { $in: delIds } });
  await Enrollment.deleteMany({ studentId: { $in: delIds } });
  await EnrollmentPackage.deleteMany({ studentId: { $in: delIds } });
  await Student.deleteMany({ _id: { $in: delIds } });
  console.log(`\n✅ Đã xoá ${delIds.length} hồ sơ. Nhật ký: ${LOG}`);
  await mongoose.disconnect();
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
