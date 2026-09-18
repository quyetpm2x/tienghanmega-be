// Xoá SĐT rác khỏi hồ sơ học sinh (đặt về rỗng, KHÔNG xoá học sinh).
//   node ... xoa-sdt-rac.js            → chạy thử
//   node ... xoa-sdt-rac.js --apply    → xoá thật
//
// Chỉ đụng ĐÚNG 3 giá trị chủ trung tâm chỉ định. Mọi giá trị đáng ngờ khác (ghi chú nhét
// nhầm vào ô SĐT, số thật viết sai định dạng) chỉ được BÁO CÁO — xoá chúng là mất thông tin.
const path = require('path');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const Student = require(path.join(BE, 'src/models/Student'));

const APPLY = process.argv.includes('--apply');
const RAC = new Set(['1', '999999999', '9999999999']);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`CHẾ ĐỘ: ${APPLY ? '⚠️  XOÁ THẬT' : 'CHẠY THỬ (không sửa)'}\n`);
  const students = await Student.find({ phone: { $nin: ['', null] } }).select('name phone').lean();

  const willClear = students.filter(s => RAC.has(String(s.phone).trim()));
  // Đáng ngờ = không phải rác đã chỉ định, nhưng cũng không giống số điện thoại bình thường.
  const odd = students.filter(s => {
    const p = String(s.phone).trim();
    if (RAC.has(p)) return false;
    return /[^\d\s+().-]/.test(p) || p.replace(/\D/g, '').length < 9;
  });

  const byVal = willClear.reduce((a, s) => { a[String(s.phone).trim()] = (a[String(s.phone).trim()] || 0) + 1; return a; }, {});
  console.log(`Hồ sơ có SĐT           : ${students.length}`);
  console.log(`SẼ XOÁ (đúng 3 giá trị): ${willClear.length}`);
  for (const [v, n] of Object.entries(byVal).sort((a, b) => b[1] - a[1])) console.log(`     "${v}" → ${n} hồ sơ`);

  console.log(`\n⚠️  KHÔNG đụng tới — ${odd.length} giá trị đáng ngờ khác, báo cáo để bạn xử tay:`);
  for (const s of odd) console.log(`     ${s.name.padEnd(26)} "${s.phone}"`);

  if (!APPLY) { console.log('\n✋ CHẠY THỬ — chưa sửa gì. Thêm --apply để xoá thật.'); await mongoose.disconnect(); return; }

  const r = await Student.updateMany({ phone: { $in: [...RAC] } }, { $set: { phone: '' } });
  console.log(`\n✅ Đã xoá SĐT của ${r.modifiedCount} hồ sơ.`);
  await mongoose.disconnect();
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
