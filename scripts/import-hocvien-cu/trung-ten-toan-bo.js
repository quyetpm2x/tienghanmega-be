// CHỈ ĐỌC. Quét TOÀN BỘ học viên trong DB, liệt kê mọi nhóm trùng tên.
//
//   node scripts/import-hocvien-cu/trung-ten-toan-bo.js
//
// Không có nhánh ghi nào trong file này — chỉ find() và ghi ra CSV ở máy.
//
// "Trùng tên" = trùng NGUYÊN VĂN sau khi bỏ qua hoa/thường và khoảng trắng thừa, GIỮ DẤU.
// Chủ trung tâm đã chốt: "Ngọc Ánh" và "Ngọc Anh" là HAI người khác nhau. Nhóm bỏ dấu mới
// trùng vẫn được in riêng ở cuối để tham khảo, KHÔNG tính là trùng.
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

const OUT = '/Users/quyet.nv1209/Downloads/trung-ten-toan-bo.csv';
const money = n => (n || 0).toLocaleString('vi-VN') + 'đ';
const d10 = v => (v ? new Date(v).toISOString().slice(0, 10) : '');
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

const nameKey = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const noMark = s => nameKey(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Đã kết nối — CHẾ ĐỘ CHỈ ĐỌC\n');

  const all = await Student.find().select('name phone email createdAt').lean();
  const group = (arr, keyFn) => {
    const m = new Map();
    for (const s of arr) { const k = keyFn(s.name); if (!m.has(k)) m.set(k, []); m.get(k).push(s); }
    return m;
  };
  const exact = [...group(all, nameKey).values()].filter(g => g.length > 1);
  // Nhóm "bỏ dấu mới trùng": chỉ giữ khi CÁC tên nguyên văn thật sự khác nhau.
  const loose = [...group(all, noMark).values()]
    .filter(g => g.length > 1 && new Set(g.map(s => nameKey(s.name))).size > 1);

  const ids = exact.flat().map(s => s._id);
  const [pkgs, enrs, pays] = await Promise.all([
    EnrollmentPackage.find({ studentId: { $in: ids } }).select('studentId netTotal paidAdjustment registeredAt note').lean(),
    Enrollment.find({ studentId: { $in: ids } }).select('studentId className courseTitle status').lean(),
    Payment.find({ studentId: { $in: ids } }).select('studentId packageId amount').lean(),
  ]);
  const byStu = arr => arr.reduce((a, x) => { (a[String(x.studentId)] ||= []).push(x); return a; }, {});
  const P = byStu(pkgs), E = byStu(enrs), Y = byStu(pays);
  const paidByPkg = pays.reduce((a, x) => { const k = String(x.packageId); a[k] = (a[k] || 0) + (x.amount || 0); return a; }, {});

  // Tiền phải đi qua paymentState như mọi nơi khác: Payment thôi là thiếu phần paidAdjustment
  // (tiền cũ nhập tay) — từng làm mình báo hụt 10 lần số thật ở một script trước.
  const infoOf = id => {
    const ps = P[id] || [];
    let tuition = 0, paid = 0, debt = 0;
    for (const p of ps) {
      const st = paymentState({ netTotal: p.netTotal, paymentsTotal: paidByPkg[String(p._id)] || 0, paidAdjustment: p.paidAdjustment });
      tuition += p.netTotal || 0; paid += st.paid; debt += st.debt;
    }
    return {
      pkgs: ps.length, tuition, paid, debt,
      regs: [...new Set(ps.map(p => p.registeredAt).filter(Boolean))].sort().join(' · '),
      cls: [...new Set((E[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))].join(' + '),
      imported: ps.some(p => String(p.note || '').includes('import excel')),
    };
  };

  exact.sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name, 'vi'));
  const lines = ['NHÓM,HỌ TÊN,SĐT,EMAIL,NGÀY THÊM,SỐ GÓI,NGÀY ĐĂNG KÝ,HỌC PHÍ,ĐÃ ĐÓNG,CÒN NỢ,LỚP,TỪ EXCEL'.split(',').map(csv).join(',')];

  console.log(`Tổng học viên            : ${all.length}`);
  console.log(`Nhóm TRÙNG TÊN nguyên văn: ${exact.length}  (${exact.flat().length} hồ sơ)`);
  console.log(`Nhóm chỉ trùng khi BỎ DẤU: ${loose.length}  → tham khảo, KHÔNG phải trùng\n`);

  let gi = 0;
  for (const g of exact) {
    gi++;
    g.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    console.log(`── [${gi}] "${g[0].name}" — ${g.length} hồ sơ ──`);
    for (const s of g) {
      const i = infoOf(String(s._id));
      console.log(`   ${d10(s.createdAt)} · SĐT ${(s.phone || '—').padEnd(12)} · ${i.pkgs} gói · HP ${money(i.tuition).padStart(12)} · đã đóng ${money(i.paid).padStart(12)} · nợ ${money(i.debt).padStart(11)} · ${i.cls || '(chưa có lớp)'}${i.imported ? ' [excel]' : ''}${i.regs ? ' · đk ' + i.regs : ''}`);
      lines.push([gi, s.name, s.phone || '', s.email || '', d10(s.createdAt), i.pkgs, i.regs, i.tuition, i.paid, i.debt, i.cls, i.imported ? 'x' : ''].map(csv).join(','));
    }
    console.log('');
  }

  if (loose.length) {
    console.log('── THAM KHẢO: tên chỉ trùng khi bỏ dấu (coi là NGƯỜI KHÁC) ──');
    for (const g of loose) console.log('   ' + g.map(s => `"${s.name}"${s.phone ? ' ' + s.phone : ''}`).join('  ≠  '));
  }

  fs.writeFileSync(OUT, '﻿' + lines.join('\n'), 'utf8');
  console.log(`\n📄 CSV: ${OUT}`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
