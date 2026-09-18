// CHỈ ĐỌC. Phân nhóm học viên "chưa đóng đồng nào" để quyết định xoá nhóm nào.
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
const Class = require(path.join(BE, 'src/models/Class'));

const OUT = '/Users/quyet.nv1209/Downloads/hoc-vien-chua-dong.csv';
const money = n => (n || 0).toLocaleString('vi-VN');
const real = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 && new Set(d).size > 1; };
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('CHẾ ĐỘ CHỈ ĐỌC\n');
  const [students, pkgs, enrs, pays, classes] = await Promise.all([
    Student.find().select('name phone createdAt').lean(),
    EnrollmentPackage.find().select('studentId netTotal paidAdjustment').lean(),
    Enrollment.find().select('studentId packageId className courseTitle status').lean(),
    Payment.find().select('studentId packageId amount').lean(),
    Class.find().select('name status').lean(),
  ]);
  const clsStatus = new Map(classes.map(c => [c.name, c.status]));
  const by = (arr, k = 'studentId') => arr.reduce((a, x) => { (a[x[k]] ||= []).push(x); return a; }, {});
  const P = by(pkgs), E = by(enrs), Y = by(pays);

  const groups = { rong: [], phiKhong: [], noDangHoc: [], noLopDong: [] };
  for (const s of students) {
    const id = String(s._id);
    const myPkgs = P[id] || [];
    const paid = myPkgs.reduce((a, p) => {
      const pt = (Y[id] || []).filter(x => String(x.packageId) === String(p._id)).reduce((t, x) => t + (x.amount || 0), 0);
      return a + paymentState({ netTotal: p.netTotal, paymentsTotal: pt, paidAdjustment: p.paidAdjustment }).paid;
    }, 0);
    if (paid > 0) continue;                                   // đã đóng → bỏ qua
    const fee = myPkgs.reduce((a, p) => a + (p.netTotal || 0), 0);
    const cls = [...new Set((E[id] || []).map(e => e.className || e.courseTitle).filter(Boolean))];
    const dangHoc = cls.some(c => clsStatus.get(c) === 'active' || clsStatus.get(c) === 'upcoming');
    const row = { s, nPkg: myPkgs.length, fee, cls: cls.join(' + '), dangHoc, phone: s.phone || '' };
    if (!myPkgs.length) groups.rong.push(row);
    else if (fee <= 0) groups.phiKhong.push(row);
    else if (dangHoc) groups.noDangHoc.push(row);
    else groups.noLopDong.push(row);
  }

  const show = (t, g, note) => {
    const sdt = g.filter(x => real(x.phone)).length;
    console.log(`\n▸ ${t}: ${g.length} em   (${sdt} em có SĐT thật)   — công nợ ${money(g.reduce((a, x) => a + x.fee, 0))}đ`);
    console.log(`  ${note}`);
    for (const x of g.slice(0, 6)) console.log(`     ${x.s.name.padEnd(24)} SĐT ${String(x.phone || '—').padEnd(13)} ${x.nPkg} gói · ${money(x.fee)}đ · ${x.cls || '(chưa có lớp)'}`);
    if (g.length > 6) console.log(`     … và ${g.length - 6} em nữa`);
  };
  const tong = Object.values(groups).reduce((a, g) => a + g.length, 0);
  console.log(`Tổng học viên trong DB: ${students.length}`);
  console.log(`CHƯA ĐÓNG đồng nào    : ${tong}`);
  show('① Không có gói đăng ký nào', groups.rong, 'hồ sơ rỗng — xoá gần như chắc chắn an toàn');
  show('② Có gói nhưng học phí = 0', groups.phiKhong, 'nhập thiếu giá — xoá được, nhưng nên kiểm lại');
  show('③ Có công nợ, lớp ĐANG HỌC', groups.noDangHoc, '⚠️ học viên thật đang theo học — xoá là mất người và mất nợ');
  show('④ Có công nợ, lớp đã đóng', groups.noLopDong, 'học viên cũ chưa trả nợ — cân nhắc');

  const lines = [['NHÓM','HỌ TÊN','SĐT','SĐT THẬT','SỐ GÓI','HỌC PHÍ','LỚP','ĐANG HỌC','NGÀY TẠO'].map(csv).join(',')];
  const push = (t, g) => g.forEach(x => lines.push([t, x.s.name, x.phone, real(x.phone) ? 'x' : '', x.nPkg, x.fee, x.cls, x.dangHoc ? 'x' : '', String(x.s.createdAt).slice(0,10)].map(csv).join(',')));
  push('1-rong', groups.rong); push('2-phi-0', groups.phiKhong);
  push('3-no-dang-hoc', groups.noDangHoc); push('4-no-lop-dong', groups.noLopDong);
  fs.writeFileSync(OUT, '﻿' + lines.join('\n'), 'utf8');
  console.log(`\nDanh sách đầy đủ: ${OUT}`);
  await mongoose.disconnect();
  console.log('Đã ngắt kết nối. KHÔNG có thao tác ghi nào.');
})().catch(async e => { console.error('Lỗi:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });
