// CHỈ ĐỌC FILE BACKUP — không kết nối database.
// Liệt kê học sinh CÒN NỢ trong backup, tách riêng "đã đóng một phần" và "chưa đóng đồng nào".
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const BE = path.join(__dirname, '../..');
const { paymentState } = require(path.join(BE, 'src/utils/packageMath'));

const BK = process.argv[2] || path.join(BE, 'backups/2026-09-19_00-49/tienghanmega_product');
const OUT = '/Users/quyet.nv1209/Downloads/no-trong-backup.csv';
const money = n => (n || 0).toLocaleString('vi-VN');
const num = v => !v ? 0 : (typeof v === 'object' ? Number(v.$numberInt ?? v.$numberLong ?? v.$numberDouble ?? 0) : Number(v));
const oid = v => (v && typeof v === 'object' && v.$oid) ? v.$oid : String(v);
const csv = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
const bson = n => execFileSync('bsondump', ['--quiet', `${BK}/${n}.bson`], { maxBuffer: 1 << 28 })
  .toString().split('\n').filter(Boolean).map(l => JSON.parse(l));

const studs = bson('students'), pkgs = bson('enrollmentpackages'), pays = bson('payments'), enrs = bson('enrollments');
const payByPkg = {}; for (const p of pays) if (p.packageId) payByPkg[oid(p.packageId)] = (payByPkg[oid(p.packageId)] || 0) + num(p.amount);
const clsByPkg = {}; for (const e of enrs) (clsByPkg[oid(e.packageId)] ||= []).push(e.className || e.courseTitle || '');
const stuById = new Map(studs.map(s => [oid(s._id), s]));

const motPhan = [], chuaDong = [];
for (const pk of pkgs) {
  const st = paymentState({ netTotal: num(pk.netTotal), paymentsTotal: payByPkg[oid(pk._id)] || 0, paidAdjustment: num(pk.paidAdjustment) });
  if (st.debt <= 0) continue;
  const s = stuById.get(oid(pk.studentId)) || { name: '(không rõ)', phone: '' };
  const row = { name: s.name, phone: s.phone || '', fee: num(pk.netTotal), paid: st.paid, debt: st.debt,
    pct: num(pk.netTotal) ? Math.round(st.paid / num(pk.netTotal) * 100) : 0,
    cls: [...new Set(clsByPkg[oid(pk._id)] || [])].filter(Boolean).join(' + ') };
  (st.paid > 0 ? motPhan : chuaDong).push(row);
}
const sap = a => a.sort((x, y) => y.debt - x.debt);
sap(motPhan); sap(chuaDong);

const bang = (t, g) => {
  console.log(`\n${'═'.repeat(88)}\n▸ ${t}: ${g.length} gói — tổng nợ ${money(g.reduce((a, r) => a + r.debt, 0))}đ\n${'═'.repeat(88)}`);
  console.log('  ' + 'HỌ TÊN'.padEnd(26) + 'SĐT'.padEnd(14) + 'HỌC PHÍ'.padStart(12) + 'ĐÃ ĐÓNG'.padStart(13) + 'CÒN NỢ'.padStart(13) + '  %  LỚP');
  for (const r of g) console.log('  ' + r.name.padEnd(26) + String(r.phone || '—').slice(0, 12).padEnd(14)
    + money(r.fee).padStart(12) + money(r.paid).padStart(13) + money(r.debt).padStart(13)
    + String(r.pct).padStart(4) + '%  ' + r.cls);
};
console.log(`Backup: ${path.basename(path.dirname(BK))}\n`);
bang('ĐÃ ĐÓNG MỘT PHẦN (0 < đã đóng < học phí)', motPhan);
bang('CHƯA ĐÓNG ĐỒNG NÀO', chuaDong);

const lines = [['NHÓM','HỌ TÊN','SĐT','HỌC PHÍ','ĐÃ ĐÓNG','CÒN NỢ','% ĐÃ ĐÓNG','LỚP'].map(csv).join(',')];
const push = (t, g) => g.forEach(r => lines.push([t, r.name, r.phone, r.fee, r.paid, r.debt, r.pct, r.cls].map(csv).join(',')));
push('da-dong-mot-phan', motPhan); push('chua-dong', chuaDong);
fs.writeFileSync(OUT, '﻿' + lines.join('\n'), 'utf8');
console.log(`\n\nCSV: ${OUT}`);
