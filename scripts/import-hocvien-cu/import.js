// Nhập "học viên cũ.xlsx" vào hệ thống.
//
//   node scripts/import-hocvien-cu/import.js            → CHẠY THỬ, không ghi gì
//   node scripts/import-hocvien-cu/import.js --apply    → GHI THẬT
//
// Cùng một file cho cả hai chế độ: chạy thử và chạy thật đi qua đúng một nhánh logic, nên
// báo cáo xem trước không thể khác việc thực sự làm.
//
// QUY TẮC (chủ trung tâm chốt):
//   • Khớp theo TÊN nguyên văn (không phân biệt hoa/thường và khoảng trắng thừa, GIỮ DẤU)
//   • Tên khớp nhiều bản ghi → lấy bản MỚI NHẤT
//   • Không khớp → tạo học sinh mới; tên na ná → báo cáo, KHÔNG tự khớp
//   • Với học sinh khớp: xoá gói cũ THUỘC KHOÁ TRONG FILE (phương án b), giữ nguyên gói khoá khác
//   • Mỗi dòng file → 1 gói + đúng 1 khoản thu, ngày đóng = ngày đăng ký, đã đóng đủ
const path = require('path');
const fs = require('fs');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { parseFile, nameKey } = require('./parse');
const { categoryOf } = require(path.join(BE, 'src/utils/courseCategory'));

const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));
const Class = require(path.join(BE, 'src/models/Class'));

const APPLY = process.argv.includes('--apply');
// Xoá các hồ sơ TRÙNG TÊN 100% cũ hơn, sau khi đã dồn dữ liệu về bản mới nhất. Tách thành cờ
// riêng vì đây là xoá HỌC SINH, nặng hơn hẳn việc xoá gói — phải duyệt riêng.
const DELETE_OLD = process.argv.includes('--delete-old');
const MARK = 'import excel 19/9/2026';          // dấu truy vết, cũng là ghi chú hiện trên giao diện
const LOG = '/Users/quyet.nv1209/Downloads/import-hocvien-cu-log.json';
const HV_CU = 'HỌC VIÊN CŨ';

// SĐT rác trong dữ liệu cũ: "1", "9999999999", "999999999"… Coi như KHÔNG có số, để khi gộp
// hồ sơ trùng tên thì số thật của bản cũ được chuyển sang bản giữ lại thay vì mất đi.
function isRealPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 9) return false;
  return new Set(d).size > 1;   // loại 111..., 999...
}

const money = n => (n || 0).toLocaleString('vi-VN') + 'đ';
const lev = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n);
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c; } return p[n]; };
const similar = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

(async () => {
  const { students, skipped } = await parseFile();
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  GHI THẬT' : 'CHẠY THỬ (không ghi)'}\n`);

  const [dbStudents, dbClasses] = await Promise.all([
    Student.find().select('name phone createdAt').lean(),
    Class.find().select('name course startDate status').lean(),
  ]);

  const clsByKey = new Map(dbClasses.map(c => [nameKey(c.name), c]));
  const byName = new Map();
  for (const s of dbStudents) {
    const k = nameKey(s.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(s);
  }
  // Tên khớp nhiều bản ghi → lấy bản MỚI NHẤT.
  for (const list of byName.values()) list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const classOf = row => clsByKey.get(nameKey(row.cls || HV_CU));
  const missingClass = students.flatMap(s => s.packages).filter(p => !classOf(p));
  if (missingClass.length) {
    console.error('❌ Có dòng không tìm thấy lớp trong DB:', [...new Set(missingClass.map(p => p.cls || HV_CU))]);
    await mongoose.disconnect(); process.exit(1);
  }
  // Các khoá được phép xoá gói cũ (phương án b) — đúng những khoá xuất hiện trong file.
  const targetCourses = new Set([...new Set(students.flatMap(s => s.packages).map(p => classOf(p).course))].map(nameKey));

  const plan = { matched: [], created: [], near: [] };
  for (const s of students) {
    const hit = byName.get(s.key);
    if (hit && hit.length) { plan.matched.push({ ...s, db: hit[0], others: hit.slice(1) }); continue; }
    const near = dbStudents.map(d => ({ d, score: similar(s.key, nameKey(d.name)) }))
      .filter(x => x.score >= 0.82).sort((a, b) => b.score - a.score).slice(0, 3);
    if (near.length) plan.near.push({ ...s, near });
    plan.created.push(s);
  }

  // Gói cũ sẽ bị xoá: chỉ của học sinh khớp, và chỉ thuộc khoá có trong file.
  const ids = plan.matched.map(m => m.db._id);
  const oldPkgs = await EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId').lean();
  const oldEnrs = await Enrollment.find({ packageId: { $in: oldPkgs.map(p => p._id) } }).select('packageId courseTitle className').lean();
  const courseByPkg = new Map();
  for (const e of oldEnrs) {
    if (!courseByPkg.has(String(e.packageId))) courseByPkg.set(String(e.packageId), new Set());
    courseByPkg.get(String(e.packageId)).add(nameKey(e.courseTitle || ''));
  }
  const delPkgIds = oldPkgs.filter(p => {
    const cs = courseByPkg.get(String(p._id));
    return cs && [...cs].every(c => targetCourses.has(c));   // chỉ xoá khi MỌI khoá của gói nằm trong file
  }).map(p => p._id);
  const keptPkgs = oldPkgs.length - delPkgIds.length;
  const delPays = await Payment.countDocuments({ packageId: { $in: delPkgIds } });

  const newPkgs = plan.matched.concat(plan.created).reduce((a, s) => a + s.packages.length, 0);
  const newMoney = plan.matched.concat(plan.created).reduce((a, s) => a + s.packages.reduce((x, p) => x + p.money, 0), 0);

  console.log('── KẾ HOẠCH ──');
  console.log(`  Học sinh khớp tên (cập nhật) : ${plan.matched.length}`);
  console.log(`  Học sinh tạo mới             : ${plan.created.length}`);
  console.log(`  Gói + khoản thu sẽ tạo       : ${newPkgs}`);
  console.log(`  Tổng tiền ghi nhận           : ${money(newMoney)}`);
  console.log(`  Gói CŨ sẽ xoá (khoá trong file): ${delPkgIds.length} gói, ${delPays} khoản thu`);
  console.log(`  Gói CŨ GIỮ LẠI (khoá khác)   : ${keptPkgs}`);
  console.log(`  Dòng bỏ qua (thiếu dữ liệu)  : ${skipped.length}`);
  if (plan.near.length) {
    console.log(`\n⚠️  ${plan.near.length} tên NA NÁ — tạo mới, KHÔNG khớp vào người có sẵn:`);
    for (const s of plan.near) console.log(`   "${s.name}"`.padEnd(34) + '≈ ' + s.near.map(x => `"${x.d.name}" ${Math.round(x.score * 100)}%`).join(', '));
  }
  // ── Hồ sơ trùng tên cũ hơn: sẽ mất gì nếu xoá ──
  const multi = plan.matched.filter(m => m.others.length);
  const oldIds = multi.flatMap(m => m.others.map(o => o._id));
  const [oPkgs, oEnrs, oPays] = await Promise.all([
    EnrollmentPackage.find({ studentId: { $in: oldIds } }).select('studentId netTotal paidAdjustment').lean(),
    Enrollment.find({ studentId: { $in: oldIds } }).select('studentId className courseTitle').lean(),
    Payment.find({ studentId: { $in: oldIds } }).select('studentId amount').lean(),
  ]);
  const by = arr => arr.reduce((a, x) => { (a[x.studentId] ||= []).push(x); return a; }, {});
  const oP = by(oPkgs), oE = by(oEnrs), oY = by(oPays);
  const infoOf = id => {
    const paid = (oY[id] || []).reduce((a, x) => a + (x.amount || 0), 0)
      + (oP[id] || []).reduce((a, x) => a + (x.paidAdjustment || 0), 0);
    return { pkgs: (oP[id] || []).length, paid, cls: [...new Set((oE[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))].join(' + ') };
  };
  const oldEmpty = [], oldWithData = [];
  for (const m of multi) for (const o of m.others) {
    const i = infoOf(String(o._id));
    (i.paid > 0 ? oldWithData : oldEmpty).push({ name: m.name, o, ...i });
  }

  // Số điện thoại thật ở bản cũ được chuyển sang bản giữ lại nếu bản đó đang trống/rác.
  const phoneMoves = [];
  for (const m of multi) {
    if (isRealPhone(m.db.phone)) continue;
    const donor = m.others.find(o => isRealPhone(o.phone));
    if (donor) phoneMoves.push({ id: m.db._id, name: m.name, from: donor.phone, was: m.db.phone || '(trống)' });
  }

  if (multi.length) {
    console.log(`\nℹ️  ${multi.length} tên trùng 100% → giữ bản MỚI NHẤT. ${oldIds.length} bản cũ hơn:`);
    console.log(`     ${oldEmpty.length} bản CHƯA có tiền → ${DELETE_OLD ? 'SẼ XOÁ' : 'giữ (chưa bật --delete-old)'}`);
    console.log(`     ${oldWithData.length} bản ĐANG CÓ TIỀN → LUÔN GIỮ LẠI, báo cáo để xử tay:`);
    for (const x of oldWithData) console.log(`        "${x.name}" bản ${String(x.o.createdAt).slice(0,10)} · SĐT ${x.o.phone || '—'} · ${x.pkgs} gói · đã đóng ${money(x.paid)} · ${x.cls || '(chưa có lớp)'}`);
    console.log(`\n📞 ${phoneMoves.length} hồ sơ sẽ được chuyển SĐT thật từ bản cũ sang:`);
    for (const x of phoneMoves) console.log(`        "${x.name}" : ${x.was} → ${x.from}`);
  }

  if (!APPLY) {
    console.log('\n✋ CHẠY THỬ — không có gì bị thay đổi. Thêm --apply để ghi thật.');
    await mongoose.disconnect(); return;
  }

  // ── GHI THẬT ──────────────────────────────────────────────────────────────────────────
  const log = { at: new Date().toISOString(), deleted: { packages: delPkgIds.map(String), payments: delPays }, students: [] };
  if (delPkgIds.length) {
    await Payment.deleteMany({ packageId: { $in: delPkgIds } });
    await Enrollment.deleteMany({ packageId: { $in: delPkgIds } });
    await EnrollmentPackage.deleteMany({ _id: { $in: delPkgIds } });
  }
  let done = 0;
  for (const s of plan.matched.concat(plan.created)) {
    let stu = s.db;
    if (!stu) {
      const [created] = await Student.create([{ name: s.name, phone: s.phone || '' }]);
      stu = created;
    }
    const rec = { name: s.name, studentId: String(stu._id), isNew: !s.db, packages: [] };
    for (const p of s.packages) {
      const cls = classOf(p);
      const courseTitle = cls.course;
      const cat = categoryOf(courseTitle);
      const [pkg] = await EnrollmentPackage.create([{
        studentId: stu._id, listTotal: p.money, discount: 0, netTotal: p.money,
        discountAllocation: 'auto', registeredAt: p.date, note: MARK,
      }]);
      await Enrollment.create([{
        studentId: stu._id, packageId: pkg._id, classId: cls._id, className: cls.name,
        courseTitle, courseCategory: cat, listPrice: p.money, discountShare: 0, netPrice: p.money,
        startDate: cls.startDate || p.date, status: cls.status === 'closed' ? 'completed' : 'active',
      }]);
      await Payment.create([{
        studentId: stu._id, packageId: pkg._id, studentName: stu.name, className: cls.name,
        courseCategory: cat, amount: p.money, paidAt: new Date(`${p.date}T03:00:00Z`),
        note: MARK, recordedBy: '',
      }]);
      rec.packages.push({ packageId: String(pkg._id), date: p.date, amount: p.money, class: cls.name });
    }
    log.students.push(rec);
    if (++done % 50 === 0) console.log(`  ... ${done}/${plan.matched.length + plan.created.length}`);
  }
  // Xoá hồ sơ trùng tên cũ hơn — chỉ khi được bật riêng.
  // Chuyển SĐT thật sang bản giữ lại TRƯỚC khi xoá bản cũ, nếu không số sẽ mất theo.
  for (const mv of phoneMoves) await Student.updateOne({ _id: mv.id }, { $set: { phone: mv.from } });
  log.phoneMoves = phoneMoves.map(x => ({ name: x.name, from: x.was, to: x.from }));
  if (phoneMoves.length) console.log(`  Đã chuyển ${phoneMoves.length} số điện thoại.`);

  // CHỈ xoá bản cũ chưa có đồng nào. Bản đang có tiền luôn được giữ — trong đó có học viên
  // đang học lớp KHÔNG nằm trong file (T07, T08, BỨT PHÁ T07), xoá là mất người thật.
  const safeIds = oldEmpty.map(x => x.o._id);
  if (DELETE_OLD && safeIds.length) {
    const delPk = (await EnrollmentPackage.find({ studentId: { $in: safeIds } }).select('_id').lean()).map(p => p._id);
    await Payment.deleteMany({ studentId: { $in: safeIds } });
    await Enrollment.deleteMany({ studentId: { $in: safeIds } });
    await EnrollmentPackage.deleteMany({ _id: { $in: delPk } });
    await Student.deleteMany({ _id: { $in: safeIds } });
    log.deletedOldStudents = safeIds.map(String);
    console.log(`  Đã xoá ${safeIds.length} hồ sơ trùng tên cũ (0đ).`);
  }
  log.keptOldWithMoney = oldWithData.map(x => ({ name: x.name, id: String(x.o._id), phone: x.o.phone, paid: x.paid, classes: x.cls }));
  log.nearMatches = plan.near.map(s => ({ file: s.name, dbGanGiong: s.near.map(x => ({ ten: x.d.name, giong: Math.round(x.score * 100) + '%' })) }));
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2), 'utf8');
  console.log(`\n✅ Xong. Nhật ký: ${LOG}`);
  await mongoose.disconnect();
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
