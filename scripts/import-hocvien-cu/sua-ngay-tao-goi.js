// Đưa "Tạo ngày" (EnrollmentPackage.createdAt) của các gói import về đúng NGÀY ĐĂNG KÝ trong
// file Excel — số ngày đó đã nằm sẵn ở trường `registeredAt` do script import ghi.
//
//   node scripts/import-hocvien-cu/sua-ngay-tao-goi.js            → CHẠY THỬ, không ghi gì
//   node scripts/import-hocvien-cu/sua-ngay-tao-goi.js --apply    → GHI THẬT
//
// Vì sao 03:00Z: backend quy mọi mốc về giờ Việt Nam (+7) rồi mới cắt ngày (vnDateStr), nên
// 03:00Z = 10:00 VN nằm gọn trong ngày đăng ký ở cả hai múi giờ. Đây cũng đúng giờ mà script
// import đã đặt cho Payment.paidAt, để "Tạo ngày" và ngày khoản thu không lệch nhau.
//
// timestamps: false ở bulkWrite là bắt buộc — nếu không mongoose sẽ tự dập updatedAt/createdAt
// theo giờ chạy script, tức là đúng thứ ta đang đi sửa.
const path = require('path');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Student = require(path.join(BE, 'src/models/Student'));

const APPLY = process.argv.includes('--apply');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const atOf = d => new Date(`${d}T03:00:00.000Z`);
// Ngày theo giờ VN của một mốc thời gian — dùng để so "đã đúng chưa", tránh sửa thừa.
const vnDay = dt => new Date(new Date(dt).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  GHI THẬT' : 'CHẠY THỬ (không ghi)'}\n`);

  const all = await EnrollmentPackage.find().select('studentId registeredAt note createdAt migratedAt').lean();
  const withReg = all.filter(p => DATE_RE.test(String(p.registeredAt || '')));
  const bad = all.filter(p => p.registeredAt && !DATE_RE.test(String(p.registeredAt)));

  const changes = withReg.filter(p => vnDay(p.createdAt) !== p.registeredAt);
  const already = withReg.length - changes.length;

  console.log('── PHẠM VI ──');
  console.log(`  Tổng gói trong DB              : ${all.length}`);
  console.log(`  Gói CÓ ngày đăng ký (sẽ xét)   : ${withReg.length}`);
  console.log(`  Gói KHÔNG có ngày đăng ký (bỏ) : ${all.length - withReg.length - bad.length}`);
  if (bad.length) console.log(`  ⚠️  registeredAt sai định dạng  : ${bad.length} → BỎ QUA`);
  console.log(`  Đã đúng sẵn, không đụng        : ${already}`);
  console.log(`  SẼ SỬA createdAt               : ${changes.length}`);

  // Tách theo nguồn: gói do import Excel sinh ra (có dấu truy vết ở note) và gói do admin tự
  // tạo trên giao diện. Hai nhóm này khác nhau về mức độ "ngày đăng ký có đáng tin không",
  // nên phải đếm riêng chứ không gộp vào một con số.
  const MARK = 'import excel 19/9/2026';
  const fromImport = changes.filter(p => String(p.note || '').includes(MARK));
  const manual = changes.filter(p => !String(p.note || '').includes(MARK));
  console.log(`     ├─ do import Excel           : ${fromImport.length}`);
  console.log(`     └─ do admin tạo tay          : ${manual.length}`);
  if (manual.length) {
    const mids = [...new Set(manual.map(p => String(p.studentId)))];
    const ms = await Student.find({ _id: { $in: mids } }).select('name').lean();
    const mn = new Map(ms.map(s => [String(s._id), s.name]));
    console.log('\n  Chi tiết nhóm TẠO TAY (xem kỹ, đây không phải dữ liệu Excel):');
    for (const p of manual) {
      console.log(`     ${(mn.get(String(p.studentId)) || '?').padEnd(26)} ${vnDay(p.createdAt)} → ${p.registeredAt}   note="${p.note || ''}"`);
    }
  }

  if (changes.length) {
    const byMonth = new Map();
    for (const p of changes) {
      const k = `${vnDay(p.createdAt)} → ${p.registeredAt.slice(0, 7)}`;
      byMonth.set(p.registeredAt.slice(0, 7), (byMonth.get(p.registeredAt.slice(0, 7)) || 0) + 1);
    }
    console.log('\n  Phân bố ngày MỚI theo tháng:');
    for (const k of [...byMonth.keys()].sort()) console.log(`     ${k} : ${byMonth.get(k)} gói`);

    const ids = [...new Set(changes.slice(0, 10).map(p => String(p.studentId)))];
    const stus = await Student.find({ _id: { $in: ids } }).select('name').lean();
    const nameOf = new Map(stus.map(s => [String(s._id), s.name]));
    console.log('\n  10 dòng mẫu:');
    for (const p of changes.slice(0, 10)) {
      console.log(`     ${(nameOf.get(String(p.studentId)) || '?').padEnd(26)} ${vnDay(p.createdAt)} → ${p.registeredAt}`);
    }
  }

  if (!APPLY) {
    console.log('\n✋ CHẠY THỬ — không có gì bị thay đổi. Thêm --apply để ghi thật.');
    await mongoose.disconnect(); return;
  }

  // Ghi thẳng qua collection của driver, KHÔNG qua Model.bulkWrite: mongoose đánh dấu
  // createdAt là immutable khi bật timestamps, nên nó lọc sạch $set rồi gửi đi một update
  // rỗng — driver ném "Update document requires atomic operators". Ở tầng collection không
  // có bước cast đó, cũng không có hook nào tự dập updatedAt.
  const ops = changes.map(p => ({
    updateOne: { filter: { _id: p._id }, update: { $set: { createdAt: atOf(p.registeredAt) } } },
  }));
  let modified = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const r = await EnrollmentPackage.collection.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    modified += r.modifiedCount;
    console.log(`  đã ghi ${Math.min(i + 500, ops.length)}/${ops.length} (modified ${r.modifiedCount})`);
  }
  if (modified !== ops.length) console.log(`  ⚠️  chỉ ${modified}/${ops.length} bản ghi thực sự đổi — kiểm tra lại`);
  console.log(`\n✅ Xong: ${ops.length} gói đã đổi "Tạo ngày" về ngày đăng ký.`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
