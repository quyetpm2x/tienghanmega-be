// DRY-RUN: CHỈ ĐỌC database, không ghi một byte nào. Không có require nào của mongoose ở đây
// gọi save/create/update — chỉ find().lean().
//
// Trả lời 4 câu trước khi ghi thật:
//   1. Tên nào khớp CHÍNH XÁC một học sinh trong DB  → sẽ cập nhật
//   2. Tên nào trùng NHIỀU học sinh trong DB          → dừng, chờ admin xử tay
//   3. Tên nào chưa có trong DB                        → sẽ tạo mới
//   4. Tên nào NA NÁ tên có sẵn                        → báo cáo, KHÔNG tự khớp
const path = require('path');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { parseFile, nameKey } = require('./parse');

const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Payment = require(path.join(BE, 'src/models/Payment'));
const Class = require(path.join(BE, 'src/models/Class'));
const Course = require(path.join(BE, 'src/models/Course'));

const f = n => (n || 0).toLocaleString('vi-VN') + 'đ';

// Khoảng cách Levenshtein — dùng để phát hiện tên "na ná" (sai 1-2 ký tự, thiếu dấu).
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
const similar = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

(async () => {
  const { students, rows, skipped } = await parseFile();

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Không tìm thấy MONGODB_URI');
  await mongoose.connect(uri);
  console.log('Đã kết nối:', (uri.split('/').pop() || '').split('?')[0], '— CHẾ ĐỘ CHỈ ĐỌC\n');

  const [dbStudents, dbClasses, dbCourses] = await Promise.all([
    Student.find().select('name phone createdAt').lean(),
    Class.find().select('name course').lean(),
    Course.find().select('title').lean(),
  ]);

  const dbByKey = new Map();
  for (const s of dbStudents) {
    const k = nameKey(s.name);
    if (!dbByKey.has(k)) dbByKey.set(k, []);
    dbByKey.get(k).push(s);
  }

  // ── Khớp lớp trong file với lớp trong DB (không phân biệt hoa/thường) ──
  const clsByKey = new Map(dbClasses.map(c => [nameKey(c.name), c]));
  const fileClasses = [...new Set(rows.map(r => r.cls).filter(Boolean))];
  const clsMiss = fileClasses.filter(c => !clsByKey.has(nameKey(c)));
  console.log('── LỚP ──');
  for (const c of fileClasses) {
    const hit = clsByKey.get(nameKey(c));
    console.log(`  ${c.padEnd(22)} → ${hit ? `"${hit.name}" · khoá: ${hit.course}` : '❌ KHÔNG THẤY TRONG DB'}`);
  }
  const hvCuCls = clsByKey.get(nameKey('HỌC VIÊN CŨ'));
  console.log(`  ${'(sheet HỌC VIÊN CŨ)'.padEnd(22)} → ${hvCuCls ? `"${hvCuCls.name}" · khoá: ${hvCuCls.course}` : '❌ KHÔNG THẤY LỚP "HỌC VIÊN CŨ"'}`);
  const courseTitles = new Set(dbCourses.map(c => nameKey(String(c.title?.vi ?? c.title ?? ''))));
  const needCourses = [...new Set([...fileClasses.map(c => clsByKey.get(nameKey(c))?.course), hvCuCls?.course].filter(Boolean))];
  for (const t of needCourses) if (!courseTitles.has(nameKey(t))) console.log(`  ⚠️  Khoá "${t}" không có trong danh sách Course`);

  // ── Phân loại học sinh ──
  const exact = [], dupInDb = [], isNew = [], nearMiss = [];
  for (const s of students) {
    const hit = dbByKey.get(s.key);
    if (hit && hit.length === 1) { exact.push({ ...s, db: hit[0] }); continue; }
    if (hit && hit.length > 1) { dupInDb.push({ ...s, db: hit }); continue; }
    const near = dbStudents
      .map(d => ({ d, score: similar(s.key, nameKey(d.name)) }))
      .filter(x => x.score >= 0.82)
      .sort((a, b) => b.score - a.score).slice(0, 3);
    if (near.length) nearMiss.push({ ...s, near });
    isNew.push(s);
  }

  // Với học sinh khớp: đang có sẵn bao nhiêu gói / khoản thu (sẽ bị thay)
  const ids = exact.map(e => e.db._id);
  const [pkgs, pays] = await Promise.all([
    EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId netTotal paidAdjustment').lean(),
    Payment.find({ studentId: { $in: ids } }).select('studentId amount').lean(),
  ]);
  const pkgByStu = pkgs.reduce((a, p) => { (a[p.studentId] ||= []).push(p); return a; }, {});
  const payByStu = pays.reduce((a, p) => { (a[p.studentId] ||= []).push(p); return a; }, {});
  const willTouch = exact.filter(e => (pkgByStu[e.db._id] || []).length);

  console.log('\n── HỌC SINH ──');
  console.log(`  Tổng trong file          : ${students.length}`);
  console.log(`  ✅ Khớp chính xác 1 người : ${exact.length}   (trong đó ${willTouch.length} em ĐÃ CÓ gói/khoản thu sẽ bị thay)`);
  console.log(`  ⛔ Trùng tên trong DB     : ${dupInDb.length}   → cần xử tay, script sẽ BỎ QUA`);
  console.log(`  ➕ Chưa có, sẽ tạo mới    : ${isNew.length}`);
  console.log(`  ⚠️  Na ná tên có sẵn      : ${nearMiss.length}   → báo cáo, KHÔNG tự khớp`);

  if (dupInDb.length) {
    console.log('\n⛔ TRÙNG TÊN TRONG DB — chọn giúp đúng người:');
    for (const s of dupInDb) console.log(`   "${s.name}" → ${s.db.length} học sinh trong DB: ` + s.db.map(d => `${d.name} (${d.phone || 'không SĐT'}, thêm ${String(d.createdAt).slice(0,10)})`).join(' | '));
  }
  if (nearMiss.length) {
    console.log('\n⚠️  TÊN NA NÁ — file có, DB có tên gần giống:');
    for (const s of nearMiss) console.log(`   file: "${s.name}"`.padEnd(38) + '≈ DB: ' + s.near.map(x => `"${x.d.name}" (${Math.round(x.score*100)}%)`).join(', '));
  }

  const totalMoney = exact.concat(isNew).reduce((t, s) => t + s.packages.reduce((a, p) => a + p.money, 0), 0);
  console.log('\n── SẼ GHI ──');
  console.log(`  Gói đăng ký tạo mới : ${exact.concat(isNew).reduce((a, s) => a + s.packages.length, 0)}`);
  console.log(`  Khoản thu tạo mới   : ${exact.concat(isNew).reduce((a, s) => a + s.packages.length, 0)}`);
  console.log(`  Tổng tiền ghi nhận  : ${f(totalMoney)}`);
  console.log(`  Gói CŨ sẽ bị xoá    : ${pkgs.length} gói, ${pays.length} khoản thu (của ${willTouch.length} học sinh khớp)`);
  console.log(`\n  Dòng bỏ qua vì thiếu dữ liệu: ${skipped.length}`);
  for (const s of skipped) console.log(`     ${s.sheet} dòng ${s.row} | ${(s.name || '(trống)').padEnd(20)} | thiếu: ${s.missing.join(', ')}`);

  await mongoose.disconnect();
  console.log('\nĐã ngắt kết nối. KHÔNG có thao tác ghi nào được thực hiện.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
