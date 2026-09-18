// CHỈ ĐỌC. Liệt kê các tên trong file khớp NHIỀU học sinh trong DB, kèm đủ thông tin để
// chủ trung tâm chọn đúng người: SĐT, ngày thêm, các gói đang có, tổng đã đóng, lớp đang học.
// Xuất ra CSV mở bằng Excel được.
const path = require('path');
const fs = require('fs');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { parseFile, nameKey } = require('./parse');

const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));

const OUT = '/Users/quyet.nv1209/Downloads/trung-ten-can-chon.csv';
const money = n => (n || 0).toLocaleString('vi-VN');
const d10 = v => (v ? new Date(v).toISOString().slice(0, 10) : '');
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

(async () => {
  const { students } = await parseFile();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Đã kết nối — CHẾ ĐỘ CHỈ ĐỌC\n');

  const dbStudents = await Student.find().select('name phone createdAt').lean();
  const byKey = new Map();
  for (const s of dbStudents) {
    const k = nameKey(s.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }

  const dups = students.filter(s => (byKey.get(s.key) || []).length > 1);
  const ids = dups.flatMap(s => byKey.get(s.key).map(d => d._id));

  const [pkgs, enrs, pays] = await Promise.all([
    EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId netTotal paidAdjustment createdAt').lean(),
    Enrollment.find({ studentId: { $in: ids } }).select('studentId className courseTitle').lean(),
    Payment.find({ studentId: { $in: ids } }).select('studentId amount').lean(),
  ]);
  const group = (arr) => arr.reduce((a, x) => { (a[x.studentId] ||= []).push(x); return a; }, {});
  const pkgBy = group(pkgs), enrBy = group(enrs), payBy = group(pays);

  const lines = [['TÊN TRONG FILE', 'SỐ GÓI TRONG FILE', 'TỔNG TIỀN FILE', 'CHI TIẾT FILE',
    'ỨNG VIÊN #', 'TÊN TRONG DB', 'SĐT', 'NGÀY THÊM', 'SỐ GÓI DB', 'ĐÃ ĐÓNG (DB)', 'LỚP ĐANG CÓ', 'CHỌN (x)'].map(csv).join(',')];

  console.log(`Có ${dups.length} tên cần chọn:\n`);
  for (const s of dups) {
    const cands = byKey.get(s.key);
    const fileDetail = s.packages.map(p => `${p.date} ${money(p.money)}đ${p.cls ? ' [' + p.cls + ']' : ' [HV cũ]'}`).join(' | ');
    const fileTotal = s.packages.reduce((a, p) => a + p.money, 0);
    console.log(`  "${s.name}"  — file: ${s.packages.length} gói, ${money(fileTotal)}đ`);
    cands.forEach((c, i) => {
      const id = String(c._id);
      const np = (pkgBy[id] || []).length;
      const paid = (payBy[id] || []).reduce((a, p) => a + (p.amount || 0), 0)
        + (pkgBy[id] || []).reduce((a, p) => a + (p.paidAdjustment || 0), 0);
      const cls = [...new Set((enrBy[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))].join(' + ');
      console.log(`      #${i + 1}  ${c.name.padEnd(22)} SĐT:${String(c.phone || '—').padEnd(14)} thêm ${d10(c.createdAt)}  ${np} gói  đã đóng ${money(paid)}đ  ${cls || '(chưa có lớp)'}`);
      lines.push([s.name, s.packages.length, fileTotal, fileDetail, i + 1, c.name, c.phone || '', d10(c.createdAt), np, paid, cls, ''].map(csv).join(','));
    });
  }

  fs.writeFileSync(OUT, '\uFEFF' + lines.join('\n'), 'utf8');
  console.log(`\nĐã ghi file để bạn duyệt: ${OUT}`);
  console.log('   → Mở bằng Excel, đánh dấu x vào cột "CHỌN" ở dòng ứng viên đúng, rồi gửi lại cho mình.');

  await mongoose.disconnect();
  console.log('Đã ngắt kết nối. KHÔNG có thao tác ghi nào vào database.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
