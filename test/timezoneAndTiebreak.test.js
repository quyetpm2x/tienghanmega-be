// KIỂM CHỨNG 5 thay đổi vừa làm có ĐỘNG tới con số không: lương, chi phí, doanh thu,
// số buổi dạy, tiến độ lớp.
//   (1) src/config/timezone.js ghim TZ = Asia/Ho_Chi_Minh
//   (2) teacherLedger#beats() — tie-break bản ghi trùng (lớp, ngày)
//   (3) classPhase#openEndedPhase + chặn đóng lớp khi khoá còn để ngỏ ngày kết thúc
// File này KHÔNG đụng DB, chỉ gọi hàm thuần.
//
// Lưu ý kỹ thuật: Node 22 ĐỌC LẠI process.env.TZ mỗi lần tạo Date mới (đã tự kiểm chứng ở
// test đầu tiên), nên đổi TZ ngay trong tiến trình test là hợp lệ. Đồng hồ được đóng băng
// bằng mock.timers({ apis: ['Date'] }) để "hôm nay" là con số xác định.
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const {
  todayDateStr, currentPayPeriodLabel, payPeriodLabel, payPeriodBounds,
  buildTeacherLedger, buildTeacherSessions, scheduledDates,
} = require('../src/utils/teacherLedger');
const { scheduledDatesOfClass, openEndedPhase } = require('../src/utils/classPhase');
const { vnDateStr, bucketExpenses, packageFacts, aggregateByMonth } = require('../src/utils/revenueModel');
const { monthOfPaidAt } = require('../src/utils/expenseInput');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- tiện ích
function withTZ(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
}

// Đóng băng đồng hồ tại một MỐC UTC cố định rồi đọc nó dưới múi giờ `tz`.
function atInstant(tz, utcMs, fn) {
  mock.timers.enable({ apis: ['Date'], now: utcMs });
  try { return withTZ(tz, fn); } finally { mock.timers.reset(); }
}

const total = (items) => items.reduce((s, i) => s + i.amount, 0);

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((x, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    permutations(rest).forEach((p) => out.push([x, ...p]));
  });
  return out;
}

// ====================================================================== A
// ẢNH HƯỞNG CỦA MÚI GIỜ LÊN CHỈ SỐ
// ======================================================================

test('A0 — tiền đề: Node đọc lại process.env.TZ cho mỗi Date mới (nếu không, mọi test A dưới đây vô nghĩa)', () => {
  // 2026-09-17 09:00 UTC = 16:00 giờ VN = 05:00 giờ New York (EDT, -4).  (thứ Năm)
  const ms = Date.UTC(2026, 8, 17, 9, 0, 0);
  const hourIn = (tz) => withTZ(tz, () => new Date(ms).getHours());
  assert.equal(hourIn('UTC'), 9, 'UTC phải đọc ra 9 giờ');
  assert.equal(hourIn('Asia/Ho_Chi_Minh'), 16, 'giờ VN phải đọc ra 16 giờ');
  assert.equal(hourIn('America/New_York'), 5, 'giờ New York phải đọc ra 5 giờ');
});

test('A1 — todayDateStr() ĐỔI NGÀY theo múi giờ: cùng một khoảnh khắc, ba máy chủ ra ba "hôm nay" khác nhau', () => {
  // 2026-09-09 22:30 UTC = 2026-09-10 05:30 giờ VN (thứ Năm) = 2026-09-09 18:30 New York.
  const ms = Date.UTC(2026, 8, 9, 22, 30, 0);
  assert.equal(atInstant('UTC', ms, todayDateStr), '2026-09-09', 'máy chủ UTC nói hôm nay là 09/09');
  assert.equal(atInstant('Asia/Ho_Chi_Minh', ms, todayDateStr), '2026-09-10', 'giờ VN nói hôm nay ĐÃ là 10/09');
  assert.equal(atInstant('America/New_York', ms, todayDateStr), '2026-09-09', 'giờ New York vẫn là 09/09');
});

test('A2 — nhãn KỲ LƯƠNG lệch nguyên MỘT THÁNG ở ranh giới ngày 10', () => {
  const ms = Date.UTC(2026, 8, 9, 22, 30, 0); // 05:30 ngày 10/09 giờ VN
  assert.equal(atInstant('UTC', ms, currentPayPeriodLabel), '2026-08', 'máy chủ UTC còn ở kỳ 2026-08');
  assert.equal(atInstant('Asia/Ho_Chi_Minh', ms, currentPayPeriodLabel), '2026-09', 'giờ VN đã sang kỳ 2026-09');
  assert.equal(atInstant('America/New_York', ms, currentPayPeriodLabel), '2026-08', 'giờ New York còn ở kỳ 2026-08');
  // => admin (trình duyệt giờ VN) mở bảng lương thấy kỳ 2026-09, backend UTC chốt kỳ 2026-08.
});

test('A2b — payPeriodLabel/payPeriodBounds tự thân KHÔNG phụ thuộc múi giờ (chỉ "hôm nay" mới lệch)', () => {
  for (const tz of ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York', 'Pacific/Kiritimati']) {
    withTZ(tz, () => {
      assert.equal(payPeriodLabel('2026-09-09'), '2026-08', `[${tz}] 09/09 thuộc kỳ 2026-08`);
      assert.equal(payPeriodLabel('2026-09-10'), '2026-09', `[${tz}] 10/09 thuộc kỳ 2026-09`);
      assert.deepEqual(payPeriodBounds('2026-09'), { start: '2026-09-10', end: '2026-10-09' },
        `[${tz}] hai đầu kỳ lương phải giống nhau ở mọi múi giờ`);
    });
  }
});

// Lớp mẫu cho phần A: lớp dạy thứ Năm, 300.000đ/buổi.
const clsThu = {
  _id: 'CA', name: 'TZ-T5',
  phases: [{
    courseTitle: 'SƠ CẤP 1', days: 'T5', fromDate: '2026-09-03', toDate: '2026-09-24',
    teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-09-03', toDate: '2026-09-24', rate: 300000 }],
  }],
};
const ledgerAt = (todayStr, classes = [clsThu], overrides = []) =>
  buildTeacherLedger({ teacherId: 'T1', classes, overrides, bonuses: [], commissions: [], todayStr });

test('A3 — "hôm nay" lệch một ngày làm SỐ BUỔI và TIỀN LƯƠNG lệch đúng một buổi', () => {
  // 2026-09-10 là thứ Năm — đúng ngày lớp có lịch.
  // Khoảnh khắc 2026-09-09 22:30 UTC: giờ VN đã là thứ Năm 10/09, giờ UTC vẫn là 09/09.
  const ms = Date.UTC(2026, 8, 9, 22, 30, 0);
  const utcToday = atInstant('UTC', ms, todayDateStr);
  const vnToday = atInstant('Asia/Ho_Chi_Minh', ms, todayDateStr);

  const utcItems = ledgerAt(utcToday);
  const vnItems = ledgerAt(vnToday);
  assert.equal(utcItems.length, 1, 'máy chủ UTC mới thấy 1 buổi (03/09)');
  assert.equal(vnItems.length, 2, 'giờ VN thấy 2 buổi (03/09 và 10/09)');
  assert.equal(total(utcItems), 300000, 'lương theo máy chủ UTC là 300.000đ');
  assert.equal(total(vnItems), 600000, 'lương theo giờ VN là 600.000đ');
  assert.equal(total(vnItems) - total(utcItems), 300000,
    'chênh lệch đúng bằng một buổi 300.000đ — đây là lý do phải ghim TZ');
});

test('A3b — buổi lệch đó còn rơi vào HAI KỲ LƯƠNG khác nhau: 300.000đ nhảy từ kỳ này sang kỳ kia', () => {
  const ms = Date.UTC(2026, 8, 9, 22, 30, 0);
  const vnItems = ledgerAt(atInstant('Asia/Ho_Chi_Minh', ms, todayDateStr));
  const byPeriod = {};
  vnItems.forEach((i) => { byPeriod[payPeriodLabel(i.date)] = (byPeriod[payPeriodLabel(i.date)] || 0) + i.amount; });
  assert.deepEqual(byPeriod, { '2026-08': 300000, '2026-09': 300000 },
    'buổi 03/09 thuộc kỳ 2026-08, buổi 10/09 thuộc kỳ 2026-09');
  // Máy chủ UTC chưa thấy buổi 10/09 nên kỳ 2026-09 của nó đang là 0đ.
  const utcItems = ledgerAt(atInstant('UTC', ms, todayDateStr));
  assert.equal(utcItems.filter((i) => payPeriodLabel(i.date) === '2026-09').length, 0,
    'máy chủ UTC báo kỳ 2026-09 chưa có buổi nào');
});

// NGHI VẤN LỚN: scheduledDatesOfClass/scheduledDates tạo `new Date('YYYY-MM-DD')` (UTC nửa đêm)
// rồi đọc getDay()/getFullYear() theo GIỜ ĐỊA PHƯƠNG. Múi giờ ÂM (mọi múi giờ châu Mỹ) đẩy cả
// cửa sổ lùi một ngày: mất ngày cuối khoá, và sinh thêm ngày TRƯỚC ngày khai giảng.
// ĐÃ VÁ (2026-09-17): lịch lớp nay sinh đúng ở MỌI múi giờ. Trước đây `new Date('YYYY-MM-DD')`
// parse ra nửa đêm UTC rồi getDay() đọc theo giờ địa phương — múi giờ âm lùi về ngày hôm
// trước. Quan trọng vì frontend chạy trong trình duyệt người dùng, ghim TZ ở server không
// bảo vệ được chỗ đó.
test('A4 — lịch lớp sinh đúng ở mọi múi giờ, kể cả múi giờ âm', () => {
  // Khoá T2,T4 từ 03/08 (thứ Hai) đến 31/08 (thứ Hai) — 9 buổi theo lịch VN.
  const cls = { phases: [{ courseTitle: 'A', days: 'T2,T4', fromDate: '2026-08-03', toDate: '2026-08-31' }] };
  const run = (tz) => withTZ(tz, () => scheduledDatesOfClass(cls, '2026-08-31'));
  assert.equal(run('UTC').length, 9, 'UTC: đủ 9 buổi');
  assert.equal(run('Asia/Ho_Chi_Minh').length, 9, 'giờ VN: đủ 9 buổi');
  const ny = run('America/New_York');
  assert.equal(ny.length, 9, 'giờ New York cũng phải ra 9 buổi');
  assert.ok(ny.includes('2026-08-31'), 'buổi cuối khoá không được biến mất');
  assert.deepEqual(ny, run('Asia/Ho_Chi_Minh'), 'ba múi giờ ra đúng cùng một lịch');
});

test('A4b — không sinh buổi ma trước ngày khai giảng ở múi giờ âm', () => {
  // Khoá chỉ dạy T2, khai giảng thứ Ba 04/08, kết thúc thứ Sáu 28/08.
  const cls = { phases: [{ courseTitle: 'A', days: 'T2', fromDate: '2026-08-04', toDate: '2026-08-28' }] };
  const run = (tz) => withTZ(tz, () => scheduledDatesOfClass(cls, '2026-08-28'));
  assert.deepEqual(run('Asia/Ho_Chi_Minh'), ['2026-08-10', '2026-08-17', '2026-08-24'], 'giờ VN: 3 buổi');
  assert.deepEqual(run('America/New_York'), ['2026-08-10', '2026-08-17', '2026-08-24'],
    'giờ New York không còn đẻ buổi 03/08 nằm trước ngày khai giảng 04/08');
});

test('A4c — scheduledDates() của teacherLedger cũng đúng ở mọi múi giờ', () => {
  const run = (tz) => withTZ(tz, () => scheduledDates('2026-08-04', '2026-08-28', 'T2'));
  assert.equal(run('Asia/Ho_Chi_Minh').length, 3, 'giờ VN: 3 buổi');
  assert.equal(run('America/New_York').length, 3, 'giờ New York cũng 3 buổi');

  // Quy ra lương: lớp T2 300.000đ/buổi, khoá 04/08–28/08.
  const cls = {
    _id: 'CB', name: 'TZ-T2',
    phases: [{
      courseTitle: 'A', days: 'T2', fromDate: '2026-08-04', toDate: '2026-08-28',
      teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-08-04', toDate: '2026-08-28', rate: 300000 }],
    }],
  };
  const pay = (tz) => withTZ(tz, () => total(ledgerAt('2026-08-28', [cls])));
  assert.equal(pay('Asia/Ho_Chi_Minh'), 900000, 'giờ VN trả 900.000đ');
  assert.equal(pay('America/New_York'), 900000, 'giờ New York cũng đúng 900.000đ, và vì đúng lịch chứ không phải nhờ may');
});

test('A5 — src/config/timezone.js thật sự ghim được TZ khi môi trường KHÔNG đặt TZ', () => {
  const env = { ...process.env };
  delete env.TZ;
  const out = execFileSync(process.execPath, ['-e',
    "require('./src/config/timezone');" +
    "const {todayDateStr}=require('./src/utils/teacherLedger');" +
    'process.stdout.write(process.env.TZ+"|"+new Date(Date.UTC(2026,8,9,22,30)).getHours()+"|"+typeof todayDateStr());',
  ], { cwd: ROOT, env, encoding: 'utf8' });
  const [tz, hour] = out.split('|');
  assert.equal(tz, 'Asia/Ho_Chi_Minh', 'phải ghim đúng múi giờ VN');
  assert.equal(hour, '5', '22:30 UTC phải đọc ra 05:30 giờ VN — TZ có hiệu lực thật');
});

// ĐÃ VÁ (2026-09-17): trước đây dùng `process.env.TZ || ...` nên hosting đặt sẵn TZ=UTC
// (rất nhiều image Docker/PaaS làm vậy) sẽ âm thầm vô hiệu việc ghim và lương lệch lại như
// cũ, không có dấu hiệu nào. Nay ghim cứng; ai thật sự cần múi giờ khác thì đặt APP_TZ.
test('A5b — TZ có sẵn trong môi trường KHÔNG vô hiệu được việc ghim', () => {
  const run = env => execFileSync(process.execPath, ['-e',
    "require('./src/config/timezone');process.stdout.write(process.env.TZ);",
  ], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });

  assert.equal(run({ TZ: 'UTC' }), 'Asia/Ho_Chi_Minh', 'TZ=UTC của hosting bị ghi đè');
  assert.equal(run({ TZ: 'America/New_York' }), 'Asia/Ho_Chi_Minh', 'múi giờ âm cũng vậy');
  assert.equal(run({ TZ: undefined }), 'Asia/Ho_Chi_Minh', 'không đặt gì thì vẫn ghim');
  assert.equal(run({ TZ: 'UTC', APP_TZ: 'Europe/Berlin' }), 'Europe/Berlin',
    'APP_TZ là đường thoát có chủ ý duy nhất');
});

// ====================================================================== B, C
// TIE-BREAK beats() VÀ TỔNG LƯƠNG
// ======================================================================

// Hai lớp thật, cùng một giảng viên, todayStr cố định 31/08/2026 (thứ Hai).
const C1 = {
  _id: 'C1', name: 'HAN01',
  phases: [{
    courseTitle: 'SƠ CẤP 1', days: 'T2,T4', fromDate: '2026-08-03', toDate: '2026-08-31',
    teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-08-03', toDate: '2026-08-31', rate: 200000 }],
  }],
};
const C2 = {
  _id: 'C2', name: 'HAN02',
  phases: [{
    courseTitle: 'SƠ CẤP 2', days: 'T3', fromDate: '2026-08-04', toDate: '2026-08-25',
    teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-08-04', toDate: '2026-08-25', rate: 250000 }],
  }],
};
const CLASSES = [C1, C2];
const TODAY = '2026-08-31';
// C1: 03,05,10,12,17,19,24,26,31/08 = 9 buổi × 200.000 = 1.800.000
// C2: 04,11,18,25/08              = 4 buổi × 250.000 = 1.000.000  → GỐC 2.800.000đ
const BASE_TOTAL = 2800000;

const ledger = (overrides) => buildTeacherLedger({
  teacherId: 'T1', classes: CLASSES, overrides, bonuses: [], commissions: [], todayStr: TODAY,
});

const rec = (id, classId, className, date, status, updatedAt) =>
  ({ _id: id, classId, className, date, status, updatedAt });

test('B0 — mốc gốc: không ngoại lệ nào thì hai lớp cho đúng 13 buổi và 2.800.000đ', () => {
  const items = ledger([]);
  assert.equal(items.length, 13, 'tổng 13 buổi (9 + 4)');
  assert.equal(total(items), BASE_TOTAL, 'lương gốc 2.800.000đ');
  assert.equal(buildTeacherSessions('T1', CLASSES, [], TODAY).length, 13, 'số buổi dạy cũng là 13');
});

// B — KHÔNG có bản ghi trùng: tie-break không được đụng vào con số, thứ tự mảng nào cũng vậy.
const NO_DUP = [
  rec('a11111111111111111111111', 'C1', 'HAN01', '2026-08-05', 'taught', '2026-08-05T12:00:00Z'),   // thứ Tư
  rec('a22222222222222222222222', 'C1', 'HAN01', '2026-08-12', 'absent', '2026-08-12T12:00:00Z'),   // thứ Tư
  rec('a33333333333333333333333', 'C2', 'HAN02', '2026-08-18', 'taught', '2026-08-18T12:00:00Z'),   // thứ Ba
  rec('a44444444444444444444444', 'C2', 'HAN02', '2026-08-25', 'not-taught', '2026-08-25T12:00:00Z'), // thứ Ba
];
const NO_DUP_TOTAL = BASE_TOTAL - 200000 - 250000; // 2.350.000đ

test('B1 — không có bản trùng: tổng lương ổn định qua CẢ 24 hoán vị và bằng đúng 2.350.000đ', () => {
  const totals = new Set();
  const counts = new Set();
  for (const p of permutations(NO_DUP)) {
    const items = ledger(p);
    totals.add(total(items));
    counts.add(items.length);
  }
  assert.equal(totals.size, 1, '24 hoán vị phải ra đúng MỘT con số lương');
  assert.equal([...totals][0], NO_DUP_TOTAL, 'trừ 1 buổi vắng (200k) và 1 buổi không dạy (250k)');
  assert.deepEqual([...counts], [11], 'còn đúng 11 buổi được trả tiền');
});

test('B2 — không có bản trùng: bật/tắt tie-break (latestWins) ra CÙNG con số — thay đổi không chạm công thức', () => {
  for (const p of permutations(NO_DUP).slice(0, 8)) {
    const on = total(buildTeacherLedger({ teacherId: 'T1', classes: CLASSES, overrides: p, bonuses: [], commissions: [], todayStr: TODAY, latestWins: true }));
    const off = total(buildTeacherLedger({ teacherId: 'T1', classes: CLASSES, overrides: p, bonuses: [], commissions: [], todayStr: TODAY, latestWins: false }));
    assert.equal(on, off, 'không có bản trùng thì hai chế độ phải trùng khít');
    assert.equal(on, NO_DUP_TOTAL, 'và vẫn là 2.350.000đ');
  }
});

// C — CÓ bản trùng cho cùng (lớp, ngày) = 17/08/2026 (thứ Hai), lớp HAN01, 200.000đ/buổi.
const TIE_A = rec('aaa11111111111111111111a', 'C1', 'HAN01', '2026-08-17', 'absent', '2026-08-17T10:00:00Z');
const TIE_B = rec('bbb22222222222222222222b', 'C1', 'HAN01', '2026-08-17', 'taught', '2026-08-17T10:00:00Z');

test('C1 — HOÀ mốc sửa: tổng lương ổn định qua CẢ 720 hoán vị, _id lớn hơn (bbb…=đã dạy) thắng', () => {
  const set = [...NO_DUP, TIE_A, TIE_B];
  const totals = new Set();
  for (const p of permutations(set)) totals.add(total(ledger(p)));
  assert.equal(totals.size, 1, '720 hoán vị phải ra đúng MỘT con số — nếu không, admin và giảng viên xem hai số khác nhau');
  assert.equal([...totals][0], NO_DUP_TOTAL,
    'bbb… (đã dạy) thắng nên buổi 17/08 vẫn được trả: tổng giữ nguyên 2.350.000đ');
});

test('C2 — mốc sửa KHÁC nhau: bản MỚI NHẤT thắng bất kể thứ tự, kể cả khi _id của nó nhỏ hơn', () => {
  // aaa… sửa MUỘN hơn bbb… nhưng _id nhỏ hơn — phải để mốc sửa quyết định, không phải _id.
  const older = { ...TIE_B, updatedAt: '2026-08-17T10:00:00Z' }; // bbb…, đã dạy
  const newer = { ...TIE_A, updatedAt: '2026-08-18T09:00:00Z' }; // aaa…, vắng (sửa sau)
  const set = [...NO_DUP, older, newer];
  const totals = new Set();
  for (const p of permutations(set)) totals.add(total(ledger(p)));
  assert.equal(totals.size, 1, '720 hoán vị phải ra đúng MỘT con số');
  assert.equal([...totals][0], NO_DUP_TOTAL - 200000,
    'bản sửa sau (vắng) thắng → mất thêm 200.000đ, còn 2.150.000đ');
});

test('C3 — chứng minh tie-break là CẦN: bỏ nó đi (latestWins=false) thì tổng lương phụ thuộc thứ tự mảng', () => {
  const set = [...NO_DUP, TIE_A, TIE_B];
  const totals = new Set();
  for (const p of permutations(set)) {
    totals.add(total(buildTeacherLedger({
      teacherId: 'T1', classes: CLASSES, overrides: p, bonuses: [], commissions: [], todayStr: TODAY, latestWins: false,
    })));
  }
  assert.equal(totals.size, 2, 'cách cũ cho ra HAI con số lương khác nhau tuỳ thứ tự trả về của Mongo');
  assert.deepEqual([...totals].sort((a, b) => a - b), [NO_DUP_TOTAL - 200000, NO_DUP_TOTAL],
    'lệch đúng một buổi 200.000đ — đúng thứ mà beats() vá lại');
});

test('C4 — bản trùng nằm ở HAI LỚP khác nhau cùng ngày thì không bị gom nhầm', () => {
  const x = rec('ccc11111111111111111111c', 'C1', 'HAN01', '2026-08-24', 'absent', '2026-08-24T10:00:00Z');
  const y = rec('ccc22222222222222222222c', 'C2', 'HAN02', '2026-08-25', 'absent', '2026-08-25T10:00:00Z');
  const t1 = total(ledger([x, y]));
  const t2 = total(ledger([y, x]));
  assert.equal(t1, t2, 'thứ tự không đổi kết quả');
  assert.equal(t1, BASE_TOTAL - 200000 - 250000, 'mỗi lớp mất đúng một buổi của mình');
});

// ====================================================================== D
// openEndedPhase VÀ SỐ BUỔI / LƯƠNG CHẠY TIẾP
// ======================================================================

const OPEN_CLS = {
  _id: 'D1', name: 'HAN-OPEN', status: 'closed', // status 'closed' KHÔNG được đường lương đọc tới
  phases: [{
    courseTitle: 'GIAO TIẾP', days: 'T2', fromDate: '2026-08-03', toDate: null,
    teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-08-03', toDate: null, rate: 300000 }],
  }],
};
const CLOSED_CLS = {
  _id: 'D2', name: 'HAN-CLOSED', status: 'active',
  phases: [{
    courseTitle: 'GIAO TIẾP', days: 'T2', fromDate: '2026-08-03', toDate: '2026-08-31',
    teachers: [{ teacherId: 'T1', teacherName: 'Cô An', fromDate: '2026-08-03', toDate: '2026-08-31', rate: 300000 }],
  }],
};
const payOf = (cls, todayStr) => total(buildTeacherLedger({
  teacherId: 'T1', classes: [cls], overrides: [], bonuses: [], commissions: [], todayStr,
}));

test('D1 — openEndedPhase chỉ ra đúng khoá còn để ngỏ; lớp đã đóng ngày thì không', () => {
  assert.equal(openEndedPhase(OPEN_CLS.phases)?.courseTitle, 'GIAO TIẾP', 'khoá GIAO TIẾP còn để ngỏ');
  assert.equal(openEndedPhase(CLOSED_CLS.phases), null, 'khoá đã điền ngày kết thúc thì không bị chặn');
});

test('D2 — quên đóng ngày: số buổi và lương TIẾP TỤC TĂNG mỗi tuần, lớp đã đóng ngày thì đứng yên', () => {
  // T2 từ 03/08/2026 (thứ Hai).
  const open = (u) => scheduledDatesOfClass(OPEN_CLS, u).length;
  const closed = (u) => scheduledDatesOfClass(CLOSED_CLS, u).length;

  assert.equal(open('2026-08-31'), 5, 'tới 31/08: cả hai đều 5 buổi');
  assert.equal(closed('2026-08-31'), 5, 'tới 31/08: lớp đã đóng ngày cũng 5 buổi');

  assert.equal(open('2026-09-28'), 9, 'tới 28/09: lớp để ngỏ đã thành 9 buổi');
  assert.equal(closed('2026-09-28'), 5, 'tới 28/09: lớp đã đóng ngày vẫn 5 buổi');

  assert.equal(open('2026-12-28'), 22, 'tới 28/12: lớp để ngỏ thành 22 buổi');
  assert.equal(closed('2026-12-28'), 5, 'tới 28/12: lớp đã đóng ngày vẫn 5 buổi');
});

test('D3 — quy ra TIỀN: bốn tháng quên đóng ngày = 5.100.000đ lương phát sinh thêm', () => {
  assert.equal(payOf(OPEN_CLS, '2026-08-31'), 1500000, '31/08: 5 buổi × 300k');
  assert.equal(payOf(CLOSED_CLS, '2026-08-31'), 1500000, '31/08: lớp đã đóng ngày cũng 1.500.000đ');

  assert.equal(payOf(OPEN_CLS, '2026-09-28'), 2700000, '28/09: lớp để ngỏ đã 2.700.000đ');
  assert.equal(payOf(OPEN_CLS, '2026-09-28') - payOf(CLOSED_CLS, '2026-09-28'), 1200000,
    'sau 1 tháng đã dôi ra 1.200.000đ (4 buổi)');

  assert.equal(payOf(OPEN_CLS, '2026-12-28'), 6600000, '28/12: lớp để ngỏ đã 6.600.000đ');
  assert.equal(payOf(OPEN_CLS, '2026-12-28') - payOf(CLOSED_CLS, '2026-12-28'), 5100000,
    'sau 4 tháng dôi ra 5.100.000đ (17 buổi) chỉ vì quên điền ngày kết thúc');
});

test('D4 — NGHI VẤN: Class.status = "closed" KHÔNG hề chặn lương — chỉ ngày kết thúc của khoá mới chặn', () => {
  assert.equal(OPEN_CLS.status, 'closed', 'lớp này đã được đánh dấu đóng');
  assert.equal(payOf(OPEN_CLS, '2026-12-28'), 6600000,
    'NGHI VẤN: lớp mang status "closed" vẫn đẻ lương tới 6.600.000đ — chốt guard ở classController là hàng rào DUY NHẤT');
});

test('D5 — NGHI VẤN: guard chỉ chạy khi ĐỔI status sang "closed"; lớp vốn đã "closed" từ trước vẫn lọt', () => {
  // classController#update: `if (body.status === 'closed' && existing.status !== 'closed')`.
  // Lớp đã 'closed' sẵn rồi mới thêm/sửa khoá thành để ngỏ thì không qua điều kiện này.
  const stillOpen = openEndedPhase(OPEN_CLS.phases);
  assert.ok(stillOpen, 'NGHI VẤN: khoá vẫn để ngỏ dù lớp đã "closed" — guard không được gọi lại');
  assert.equal(scheduledDatesOfClass(OPEN_CLS, '2027-08-30').length, 57,
    'NGHI VẤN: một năm sau vẫn sinh tiếp, tổng 57 buổi');
});

test('D6 — "tiến độ lớp": lớp để ngỏ không có mẫu số, lớp đã đóng ngày thì có', () => {
  const doneOpen = scheduledDatesOfClass(OPEN_CLS, '2026-09-28').length;
  const plannedOpen = OPEN_CLS.phases[0].toDate ? scheduledDatesOfClass(OPEN_CLS, OPEN_CLS.phases[0].toDate).length : null;
  assert.equal(plannedOpen, null, 'không có ngày kết thúc thì không tính được "đã học x/y buổi"');
  assert.equal(doneOpen, 9, 'chỉ biết đã sinh 9 buổi, không biết còn bao nhiêu');

  // NGHI VẤN: scheduledDatesOfClass BỎ QUA `until` với khoá đã có toDate — nó sinh cả buổi
  // TƯƠNG LAI. Chỉ buildTeacherSessions mới lọc `d <= todayStr` về sau, nên bất kỳ màn hình
  // nào gọi thẳng hàm này để đếm "đã học" sẽ đếm thừa.
  const rawClosed = scheduledDatesOfClass(CLOSED_CLS, '2026-08-17').length;
  assert.equal(rawClosed, 5, 'NGHI VẤN: hỏi "tới 17/08" vẫn trả đủ 5 buổi của cả khoá, kể cả 24 và 31/08');
  const doneClosed = scheduledDatesOfClass(CLOSED_CLS, '2026-08-17').filter(d => d <= '2026-08-17').length;
  const plannedClosed = scheduledDatesOfClass(CLOSED_CLS, CLOSED_CLS.phases[0].toDate).length;
  assert.deepEqual([doneClosed, plannedClosed], [3, 5], 'lọc đúng thì tiến độ là 3/5 buổi');
  assert.equal(payOf(CLOSED_CLS, '2026-08-17'), 900000, 'sổ lương thì lọc đúng: mới trả 3 buổi = 900.000đ');
});

// ====================================================================== E
// CHI PHÍ VÀ DOANH THU
// ======================================================================
// revenueModel.js cắt ngày bằng OFFSET CỨNG +7 (VN_OFFSET_MS), không dùng giờ tiến trình →
// hai thay đổi trên không chạm tới. Chốt lại bằng test để lần sau sửa TZ không làm vỡ.

test('E1 — ranh giới THÁNG của khoản chi KHÔNG phụ thuộc múi giờ tiến trình (offset +7 cứng)', () => {
  // 2026-09-30 18:00 UTC = 2026-10-01 01:00 giờ VN (thứ Năm) → phải thuộc tháng 2026-10.
  const expenses = [{ paidAt: new Date(Date.UTC(2026, 8, 30, 18, 0, 0)), amount: 5000000, category: 'rent' }];
  const results = ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York', 'Pacific/Kiritimati']
    .map((tz) => withTZ(tz, () => JSON.stringify(bucketExpenses(expenses))));
  assert.equal(new Set(results).size, 1, 'bốn múi giờ phải cho cùng một kết quả gom chi phí');
  assert.equal(bucketExpenses(expenses).byMonth['2026-10'].rent, 5000000,
    'khoản chi 01/10 giờ VN thuộc tháng 2026-10, không rơi về 2026-09');
});

test('E2 — monthOfPaidAt cũng bất biến theo múi giờ, cả khi nhận Date lẫn chuỗi', () => {
  const d = new Date(Date.UTC(2026, 8, 30, 18, 0, 0)); // 01/10 giờ VN
  for (const tz of ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York']) {
    withTZ(tz, () => {
      assert.equal(monthOfPaidAt(d), '2026-10', `[${tz}] Date 30/09 18:00 UTC → tháng 2026-10`);
      assert.equal(monthOfPaidAt('2026-09-30'), '2026-09', `[${tz}] chuỗi ngày cắt thẳng, không đổi múi giờ`);
      assert.equal(vnDateStr(d), '2026-10-01', `[${tz}] vnDateStr luôn ra 01/10`);
    });
  }
});

test('E3 — tháng chốt DOANH THU cũng bất biến theo múi giờ', () => {
  const packages = [{ _id: 'P1', netTotal: 12000000, enrollments: [{ courseCategory: 'beginner', netPrice: 12000000, startDate: '2026-09-01' }] }];
  // Đóng tiền 2026-09-30 19:00 UTC = 02:00 ngày 01/10 giờ VN → doanh thu thuộc tháng 10.
  const payments = [{ packageId: 'P1', amount: 12000000, paidAt: new Date(Date.UTC(2026, 8, 30, 19, 0, 0)) }];
  const months = ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'].map((tz) => withTZ(tz, () => {
    const facts = packageFacts(packages, payments);
    return Object.keys(aggregateByMonth(packages, facts))[0];
  }));
  assert.deepEqual(months, ['2026-10', '2026-10', '2026-10'], 'ba múi giờ đều chốt vào tháng 2026-10');
});

test('E4 — NGHI VẤN: doanh thu/chi phí dùng offset +7 CỨNG còn lương dùng giờ tiến trình → hai bên lệch nhau nếu TZ không phải giờ VN', () => {
  const ms = Date.UTC(2026, 8, 30, 18, 0, 0); // 01/10/2026 01:00 giờ VN (thứ Năm)
  const utcToday = atInstant('UTC', ms, todayDateStr);
  const vnToday = atInstant('Asia/Ho_Chi_Minh', ms, todayDateStr);
  const revenueDay = withTZ('UTC', () => vnDateStr(new Date(ms)));

  assert.equal(revenueDay, '2026-10-01', 'doanh thu: đã sang ngày 01/10 (offset +7 cứng)');
  assert.equal(vnToday, '2026-10-01', 'lương trên máy chủ giờ VN: cũng 01/10 — khớp');
  assert.equal(utcToday, '2026-09-30',
    'NGHI VẤN: trên máy chủ UTC, lương vẫn ở 30/09 trong khi doanh thu đã sang 01/10 — báo cáo lãi/lỗ tháng lệch nhau một ngày');
  assert.notEqual(utcToday.slice(0, 7), revenueDay.slice(0, 7), 'lệch tới mức khác THÁNG');
});

test('E5 — hai thay đổi (tie-break, openEndedPhase) không đụng gì tới gom chi phí/doanh thu', () => {
  // Bản ghi buổi dạy và phases không phải đầu vào của revenueModel — kiểm chứng bằng cách
  // gom chi phí lương của một kỳ: chỉ phụ thuộc paidAt và amount.
  const expenses = [
    { paidAt: '2026-09-10', amount: 2350000, category: 'salary' }, // thứ Năm
    { paidAt: '2026-10-10', amount: 2150000, category: 'salary' }, // thứ Bảy
  ];
  const { byMonth, total: t } = bucketExpenses(expenses);
  assert.equal(byMonth['2026-09'].salary, 2350000, 'kỳ lương trả ngày 10/09 nằm ở tháng 09');
  assert.equal(byMonth['2026-10'].salary, 2150000, 'kỳ lương trả ngày 10/10 nằm ở tháng 10');
  assert.equal(t, 4500000, 'tổng chi lương 4.500.000đ');
  assert.equal(bucketExpenses(expenses, { from: '2026-10-01', to: '2026-10-31' }).total, 2150000,
    'lọc theo khoảng ngày chi vẫn đúng');
});
