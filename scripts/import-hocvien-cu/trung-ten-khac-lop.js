// CHỈ ĐỌC. Tìm các học viên TRÙNG TÊN 100% nhưng đang ở LỚP KHÁC NHAU.
// Trùng tên cùng lớp → nhiều khả năng là hồ sơ nhân đôi.
// Trùng tên khác lớp → nhiều khả năng là người khác nhau, nhưng cần mắt người xác nhận.
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

const OUT = '/Users/quyet.nv1209/Downloads/trung-ten-khac-lop.csv';
const money = n => (n || 0).toLocaleString('vi-VN');
const key = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();   // giữ dấu
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('CHẾ ĐỘ CHỈ ĐỌC\n');
  const [students, pkgs, enrs, pays] = await Promise.all([
    Student.find().select('name phone createdAt').lean(),
    EnrollmentPackage.find().select('studentId netTotal paidAdjustment registeredAt').lean(),
    Enrollment.find().select('studentId className courseTitle').lean(),
    Payment.find().select('studentId packageId amount').lean(),
  ]);
  const by = a => a.reduce((x, y) => { (x[y.studentId] ||= []).push(y); return x; }, {});
  const P = by(pkgs), E = by(enrs), Y = by(pays);
  const info = s => {
    const id = String(s._id);
    const paid = (P[id] || []).reduce((a, pk) => {
      const pt = (Y[id] || []).filter(x => String(x.packageId) === String(pk._id)).reduce((t, x) => t + (x.amount || 0), 0);
      return a + paymentState({ netTotal: pk.netTotal, paymentsTotal: pt, paidAdjustment: pk.paidAdjustment }).paid;
    }, 0);
    const cls = [...new Set((E[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))];
    return { paid, cls, fee: (P[id] || []).reduce((a, p) => a + (p.netTotal || 0), 0), nPkg: (P[id] || []).length };
  };

  const groups = new Map();
  for (const s of students) {
    const k = key(s.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }

  const khacLop = [], cungLop = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const rows = list.map(s => ({ s, ...info(s) }));
    const sets = rows.map(r => r.cls.slice().sort().join('|'));
    (new Set(sets).size === rows.length ? khacLop : cungLop).push(rows);
  }

  const dump = (title, arr, note) => {
    console.log(`\n${'═'.repeat(70)}\n${title}: ${arr.length} tên\n  ${note}\n${'═'.repeat(70)}`);
    for (const rows of arr.sort((a, b) => b.length - a.length)) {
      console.log(`\n  "${rows[0].s.name}" — ${rows.length} hồ sơ`);
      for (const r of rows) {
        console.log(`     SĐT ${String(r.s.phone || '—').padEnd(14)} ${r.nPkg} gói · học phí ${money(r.fee).padStart(10)}đ · đã đóng ${money(r.paid).padStart(10)}đ · ${r.cls.join(' + ') || '(chưa có lớp)'} · tạo ${String(r.s.createdAt).slice(0, 10)}`);
      }
    }
  };
  console.log(`Tổng học viên: ${students.length} · số tên bị trùng: ${khacLop.length + cungLop.length}`);
  dump('① TRÙNG TÊN, KHÁC LỚP', khacLop, 'nhiều khả năng là NGƯỜI KHÁC NHAU — cần mắt người xác nhận');
  dump('② TRÙNG TÊN, CÙNG LỚP', cungLop, '⚠️ nhiều khả năng là HỒ SƠ NHÂN ĐÔI của cùng một người');

  const lines = [['NHÓM', 'HỌ TÊN', 'SĐT', 'SỐ GÓI', 'HỌC PHÍ', 'ĐÃ ĐÓNG', 'LỚP', 'NGÀY TẠO', 'ID'].map(csv).join(',')];
  const push = (t, arr) => arr.forEach(rows => rows.forEach(r =>
    lines.push([t, r.s.name, r.s.phone || '', r.nPkg, r.fee, r.paid, r.cls.join(' + '), String(r.s.createdAt).slice(0, 10), String(r.s._id)].map(csv).join(','))));
  push('khac-lop', khacLop); push('cung-lop', cungLop);
  fs.writeFileSync(OUT, '﻿' + lines.join('\n'), 'utf8');
  console.log(`\n\nDanh sách đầy đủ: ${OUT}`);
  await mongoose.disconnect();
  console.log('Đã ngắt kết nối. KHÔNG có thao tác ghi nào.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
