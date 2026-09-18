// CHỈ ĐỌC. Đối chiếu CÔNG NỢ trong backup (trước import) với hiện trạng, khớp theo TÊN.
// Mục đích: đợt import ghi mọi gói từ Excel là "đã đóng đủ", nên nợ cũ của những em đó biến
// mất. Bảng này liệt kê lại để admin kiểm và sửa học phí bằng tay — script KHÔNG tự sửa.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const BE = path.join(__dirname, '../..');
require(path.join(BE, 'node_modules/dotenv')).config({ path: path.join(BE, '.env') });
const mongoose = require(path.join(BE, 'node_modules/mongoose'));
const { paymentState } = require(path.join(BE, 'src/utils/packageMath'));
const Student = require(path.join(BE, 'src/models/Student'));
const EnrollmentPackage = require(path.join(BE, 'src/models/EnrollmentPackage'));
const Enrollment = require(path.join(BE, 'src/models/Enrollment'));
const Payment = require(path.join(BE, 'src/models/Payment'));

const BK = process.argv[2] || path.join(BE, 'backups/2026-09-19_00-49/tienghanmega_product');
const OUT = '/Users/quyet.nv1209/Downloads/no-cu-can-kiem.csv';
const money = n => (n || 0).toLocaleString('vi-VN');
const key = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();   // giữ dấu
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

const num = v => !v ? 0 : (typeof v === 'object'
  ? Number(v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? 0) : Number(v));
const oid = v => (v && typeof v === 'object' && v.$oid) ? v.$oid : String(v);
const loadBson = n => execFileSync('bsondump', ['--quiet', `${BK}/${n}.bson`], { maxBuffer: 1 << 28 })
  .toString().split('\n').filter(Boolean).map(l => JSON.parse(l));

(async () => {
  // ── Bên BACKUP (đọc file, không chạm DB) ──
  const bPkgs = loadBson('enrollmentpackages'), bPays = loadBson('payments'),
        bStus = loadBson('students'), bEnrs = loadBson('enrollments');
  const bPayByPkg = {};
  for (const p of bPays) if (p.packageId) bPayByPkg[oid(p.packageId)] = (bPayByPkg[oid(p.packageId)] || 0) + num(p.amount);
  const bClsByStu = {};
  for (const e of bEnrs) (bClsByStu[oid(e.studentId)] ||= new Set()).add(e.className || e.courseTitle || '');
  const bName = new Map(bStus.map(s => [oid(s._id), { name: s.name, phone: s.phone || '' }]));

  const noCu = new Map();   // key tên → { name, phone, fee, paid, debt, cls }
  for (const pk of bPkgs) {
    const st = paymentState({ netTotal: num(pk.netTotal), paymentsTotal: bPayByPkg[oid(pk._id)] || 0, paidAdjustment: num(pk.paidAdjustment) });
    if (st.debt <= 0) continue;
    const sid = oid(pk.studentId), info = bName.get(sid) || { name: '?', phone: '' };
    const k = key(info.name);
    if (!noCu.has(k)) noCu.set(k, { name: info.name, phone: info.phone, fee: 0, paid: 0, debt: 0, cls: new Set() });
    const r = noCu.get(k);
    r.fee += num(pk.netTotal); r.paid += st.paid; r.debt += st.debt;
    for (const c of (bClsByStu[sid] || [])) if (c) r.cls.add(c);
  }

  // ── Bên HIỆN TẠI ──
  await mongoose.connect(process.env.MONGODB_URI);
  const [cStus, cPkgs, cPays, cEnrs] = await Promise.all([
    Student.find().select('name phone').lean(),
    EnrollmentPackage.find().select('studentId netTotal paidAdjustment').lean(),
    Payment.find().select('packageId amount').lean(),
    Enrollment.find().select('studentId className courseTitle').lean(),
  ]);
  const cPayBy = cPays.reduce((a, p) => { a[p.packageId] = (a[p.packageId] || 0) + (p.amount || 0); return a; }, {});
  const cClsBy = cEnrs.reduce((a, e) => { (a[e.studentId] ||= new Set()).add(e.className || e.courseTitle); return a; }, {});
  const cur = new Map();
  for (const s of cStus) {
    const k = key(s.name);
    if (!cur.has(k)) cur.set(k, { names: [], fee: 0, paid: 0, debt: 0, cls: new Set(), phones: new Set(), n: 0 });
    const r = cur.get(k); r.n++; if (s.phone) r.phones.add(s.phone);
    for (const c of (cClsBy[s._id] || [])) if (c) r.cls.add(c);
  }
  for (const p of cPkgs) {
    const s = cStus.find(x => String(x._id) === String(p.studentId)); if (!s) continue;
    const r = cur.get(key(s.name)); if (!r) continue;
    const st = paymentState({ netTotal: p.netTotal, paymentsTotal: cPayBy[p._id] || 0, paidAdjustment: p.paidAdjustment });
    r.fee += p.netTotal || 0; r.paid += st.paid; r.debt += st.debt;
  }

  const rows = [...noCu.values()].map(b => {
    const c = cur.get(key(b.name));
    return { b, c, trangThai: !c ? 'KHÔNG CÒN TRONG DB' : c.debt <= 0 ? 'NỢ ĐÃ BIẾN MẤT' : c.debt !== b.debt ? 'NỢ ĐÃ ĐỔI' : 'NỢ GIỮ NGUYÊN' };
  }).sort((a, b) => b.b.debt - a.b.debt);

  const dem = rows.reduce((a, r) => { a[r.trangThai] = (a[r.trangThai] || 0) + 1; return a; }, {});
  console.log(`Học sinh CÓ NỢ trong backup: ${rows.length}  ·  tổng nợ cũ ${money(rows.reduce((a, r) => a + r.b.debt, 0))}đ\n`);
  for (const [k, v] of Object.entries(dem)) console.log(`  ${k.padEnd(22)} ${v}`);

  for (const nhom of ['NỢ ĐÃ BIẾN MẤT', 'NỢ ĐÃ ĐỔI', 'KHÔNG CÒN TRONG DB', 'NỢ GIỮ NGUYÊN']) {
    const g = rows.filter(r => r.trangThai === nhom);
    if (!g.length) continue;
    console.log(`\n${'═'.repeat(76)}\n▸ ${nhom}: ${g.length} em — tổng nợ cũ ${money(g.reduce((a, r) => a + r.b.debt, 0))}đ\n${'═'.repeat(76)}`);
    for (const r of g) {
      console.log(`  ${r.b.name.padEnd(24)} nợ cũ ${money(r.b.debt).padStart(11)}đ  →  nay ${r.c ? money(r.c.debt).padStart(11) + 'đ' : '(đã xoá)'.padStart(12)}`);
      console.log(`     backup: học phí ${money(r.b.fee)}đ · đã đóng ${money(r.b.paid)}đ · ${[...r.b.cls].join(' + ')}`);
      if (r.c) console.log(`     nay   : học phí ${money(r.c.fee)}đ · đã đóng ${money(r.c.paid)}đ · ${r.c.n} hồ sơ · ${[...r.c.cls].join(' + ')}`);
    }
  }

  const lines = [['TRẠNG THÁI','HỌ TÊN','SĐT BACKUP','NỢ CŨ','HỌC PHÍ CŨ','ĐÃ ĐÓNG CŨ','LỚP CŨ','NỢ NAY','HỌC PHÍ NAY','ĐÃ ĐÓNG NAY','SỐ HỒ SƠ NAY','LỚP NAY'].map(csv).join(',')];
  for (const r of rows) lines.push([r.trangThai, r.b.name, r.b.phone, r.b.debt, r.b.fee, r.b.paid, [...r.b.cls].join(' + '),
    r.c ? r.c.debt : '', r.c ? r.c.fee : '', r.c ? r.c.paid : '', r.c ? r.c.n : '', r.c ? [...r.c.cls].join(' + ') : ''].map(csv).join(','));
  fs.writeFileSync(OUT, '﻿' + lines.join('\n'), 'utf8');
  console.log(`\n\nDanh sách đầy đủ cho admin: ${OUT}`);
  await mongoose.disconnect();
  console.log('Đã ngắt kết nối. KHÔNG có thao tác ghi nào.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
