// Đổi ghi chú của các bản ghi do đợt import tạo ra.
//   node ... doi-note.js            → chạy thử
//   node ... doi-note.js --apply    → đổi thật
//
// Giao diện ghép "note · bởi recordedBy", nên để hiện đúng "import excel 19/9/2026" thì phải
// đặt note = chuỗi đó VÀ xoá recordedBy (nếu không sẽ thành "... · bởi import").
const path = require('path');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Payment = require(path.join(BE, 'src/models/Payment'));

const APPLY = process.argv.includes('--apply');
const CU = '[import:hocvien-cu]';
const MOI = 'import excel 19/9/2026';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  ĐỔI THẬT' : 'CHẠY THỬ (không đổi)'}\n`);
  const [nPkg, nPay, nBy] = await Promise.all([
    EnrollmentPackage.countDocuments({ note: CU }),
    Payment.countDocuments({ note: CU }),
    Payment.countDocuments({ recordedBy: 'import' }),
  ]);
  console.log(`  Gói có ghi chú "${CU}"      : ${nPkg}`);
  console.log(`  Khoản thu có ghi chú đó     : ${nPay}`);
  console.log(`  Khoản thu có recordedBy="import": ${nBy}`);
  console.log(`\n  → note sẽ thành : "${MOI}"`);
  console.log(`  → recordedBy     : xoá (để không hiện "· bởi import")`);

  if (!APPLY) { console.log('\n✋ CHẠY THỬ — chưa đổi gì. Thêm --apply để đổi thật.'); await mongoose.disconnect(); return; }

  const r1 = await EnrollmentPackage.updateMany({ note: CU }, { $set: { note: MOI } });
  const r2 = await Payment.updateMany({ note: CU }, { $set: { note: MOI } });
  const r3 = await Payment.updateMany({ recordedBy: 'import' }, { $set: { recordedBy: '' } });
  console.log(`\n✅ Đã đổi: ${r1.modifiedCount} gói · ${r2.modifiedCount} khoản thu · xoá recordedBy ở ${r3.modifiedCount} khoản thu.`);
  await mongoose.disconnect();
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
