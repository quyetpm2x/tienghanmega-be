// Đọc và chuẩn hoá file "học viên cũ.xlsx" thành danh sách học sinh + gói đăng ký.
// THUẦN ĐỌC FILE, không chạm database — dùng chung cho cả bước dry-run lẫn bước ghi thật,
// để hai bước không thể hiểu file theo hai cách khác nhau.
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../../../tienhanmega-fe/node_modules/exceljs'));

const FILE = '/Users/quyet.nv1209/Downloads/học viên cũ.xlsx';

// Sửa tay các ô hỏng, do chủ trung tâm xác nhận từng dòng. Khoá theo "sheet:dòng" để nếu
// file được sửa lại rồi chạy lại thì các ô này đã đúng sẵn, ghi đè cũng ra cùng kết quả.
const OVERRIDE = {
  'HỌC VIÊN CŨ:37':  { date: '2026-02-03' },
  'HỌC VIÊN CŨ:69':  { date: '2026-03-22' },
  'HỌC VIÊN CŨ:58':  { date: '2026-03-14' },
  'combo:244':       { date: '2026-03-14' },
  'combo:259':       { date: '2026-03-29' },
  'combo:334':       { money: 2990000 },
};

const cell = v => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map(r => r.text).join('') ?? '');
  return String(v).trim();
};

// "1.490K" → 1490000 · "2990000" → 2990000
function parseMoney(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const k = /k$/i.test(s);
  const d = s.replace(/[^\d]/g, '');
  if (!d) return null;
  return k ? Number(d) * 1000 : Number(d);
}

// Khoá so khớp tên: GIỮ NGUYÊN DẤU, chỉ bỏ khác biệt vô nghĩa (hoa/thường, khoảng trắng thừa).
//
// Bản đầu bỏ dấu tiếng Việt và gộp nhầm những người KHÁC NHAU thành một: "Ngọc Ánh" với
// "Ngọc Anh", "Hân Hân" với "Han Han", "Lâm" với "Lam", "Phượng" với "Phương". Trong tiếng
// Việt dấu là một phần của tên chứ không phải biến thể cách viết — bỏ dấu là đánh đồng hai
// người. Những cặp lệch dấu giờ rơi vào diện "na ná", được BÁO CÁO thay vì tự khớp.
function nameKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function parseFile() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const rows = [];
  const skipped = [];

  for (const ws of wb.worksheets) {
    const hdr = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i] = cell(c.value); });
    const idx = n => hdr.findIndex(h => (h || '').toUpperCase().includes(n));
    const iName = idx('HỌ TÊN');
    const iDate = idx('NGÀY ĐĂNG');
    const iMoney = idx('HỌC PHÍ') >= 0 ? idx('HỌC PHÍ') : idx('TỔNG SỐ TIỀN');
    const iClass = idx('LỚP');
    const iPhone = idx('SĐT');

    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const g = i => (i > 0 ? cell(row.getCell(i).value) : '');
      const ov = OVERRIDE[`${ws.name}:${n}`] || {};
      const name = g(iName);
      const date = ov.date || g(iDate);
      const money = ov.money != null ? ov.money : parseMoney(g(iMoney));
      const rec = { sheet: ws.name, row: n, name, key: nameKey(name), date, money, cls: g(iClass), phone: g(iPhone) };

      // Thiếu tên / ngày / tiền thì KHÔNG đoán — để riêng cho admin bổ sung sau.
      const missing = [];
      if (!name) missing.push('tên');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) missing.push('ngày');
      if (!(money > 0)) missing.push('tiền');
      if (missing.length) { skipped.push({ ...rec, missing }); return; }
      rows.push(rec);
    });
  }

  // Cùng tên = CÙNG MỘT NGƯỜI đăng ký nhiều lần (chủ trung tâm xác nhận) → gộp thành một
  // học sinh mang nhiều gói, không tạo nhiều học sinh trùng tên.
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(r.key)) byKey.set(r.key, { key: r.key, name: r.name, phone: '', packages: [] });
    const s = byKey.get(r.key);
    if (!s.phone && r.phone) s.phone = r.phone;
    s.packages.push(r);
  }
  for (const s of byKey.values()) s.packages.sort((a, b) => a.date.localeCompare(b.date));

  return { students: [...byKey.values()], rows, skipped };
}

module.exports = { parseFile, nameKey, parseMoney, FILE };
