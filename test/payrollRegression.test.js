// Lưới an toàn cho đợt refactor lương: chốt lại HÀNH VI HIỆN TẠI của đường tính lương
// (số buổi dạy → đơn giá theo ngày → sổ lương → kỳ lương) và phần chi phí lương.
// Mọi test ở đây mô tả code ĐANG CHẠY, không phải code "nên chạy". Chỗ nào hành vi hiện tại
// đáng ngờ thì đánh dấu bằng comment `// NGHI VẤN:` ngay trên test, KHÔNG sửa source.
//
// Lịch các ngày dùng trong fixture (đã kiểm tay):
//   Tháng 8/2026 — T2: 03, 10, 17, 24, 31 | T3: 04, 11, 18, 25 | T4: 05, 12, 19, 26
//   Tháng 9/2026 — T2: 07, 14, 21, 28 | T4: 02, 09, 16, 23, 30 | T5: 03, 10, 17, 24
//   09/01/2026 là T6, 10/01/2026 là T7 (mốc kỳ lương bắc qua tháng 1)
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTeacherSessions, buildTeacherLedger, payPeriodLabel, payPeriodBounds,
  latestPerClassDate, editedAt, scheduledDates, DEFAULT_PAY_PERIOD_START_DAY,
} = require('../src/utils/teacherLedger');
const { effectivePhases, phaseAt, scheduledDatesOfClass, validatePhases } = require('../src/utils/classPhase');
const { rateAt, validateRateHistory } = require('../src/utils/classRate');
const { effectiveAssignments, teacherIdOnDate } = require('../src/utils/classAssignment');
const { verifiedAfterUpsert, isAbnormalPayment } = require('../src/utils/paymentVerify');
const { bucketExpenses, expenseMonthKey } = require('../src/utils/revenueModel');

const T1 = 't1'; // Cô A — giảng viên chính
const T2 = 't2'; // Cô B — giảng viên thứ hai / dạy thay
const TODAY = '2026-09-30'; // ngày "hôm nay" giả lập, mọi buổi trong fixture đều đã diễn ra

// Lớp chuẩn: 1 khoá, lịch T2, 03/08/2026 → 31/08/2026 (5 buổi T2), 200k/buổi, cô A dạy.
const baseClass = (extra = {}) => ({
  _id: 'c1', name: 'VIP200426 - Mango', course: 'TOPIK I',
  days: 'T2', time: '19:30 - 21:30',
  startDate: '2026-08-03', endDate: '2026-08-31',
  ratePerSession: 200000, teacherId: T1, teacher: 'Cô A',
  teacherAssignments: [], rateHistory: [], ...extra,
});

const ledger = ({ teacherId = T1, classes, overrides = [], bonuses = [], commissions = [], todayStr = TODAY }) =>
  buildTeacherLedger({ teacherId, classes, overrides, bonuses, commissions, todayStr });

const total = items => items.reduce((s, i) => s + i.amount, 0);
const sessionsOf = items => items.filter(i => i.kind === 'session');
const datesOf = items => items.map(i => i.date).sort();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Lớp một khoá, một giảng viên, lương cố định
// ─────────────────────────────────────────────────────────────────────────────
test('lớp một khoá một giảng viên lương cố định: đúng 5 buổi T2 tháng 8 và đúng tổng tiền', () => {
  const items = ledger({ classes: [baseClass()] });
  assert.deepEqual(
    datesOf(items),
    ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'],
    'phải sinh đúng 5 ngày T2 trong khoảng 03/08–31/08',
  );
  assert.equal(items.length, 5, 'không có ngoại lệ thì mỗi ngày theo lịch là một buổi dạy');
  assert.equal(total(items), 1000000, '5 buổi × 200.000đ = 1.000.000đ');
  assert.ok(items.every(i => i.kind === 'session'), 'mọi dòng đều là dòng buổi dạy');
});

test('buổi có lịch nhưng chưa tới ngày hôm nay thì chưa được tính tiền', () => {
  // Chốt "hôm nay" là 17/08 → chỉ 03, 10, 17 đã diễn ra
  const items = ledger({ classes: [baseClass()], todayStr: '2026-08-17' });
  assert.deepEqual(datesOf(items), ['2026-08-03', '2026-08-10', '2026-08-17'], 'chỉ tính buổi tới hết ngày hôm nay');
  assert.equal(total(items), 600000, '3 buổi × 200.000đ');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Đổi giảng viên giữa chừng
// ─────────────────────────────────────────────────────────────────────────────
test('lớp đổi giảng viên giữa chừng: buổi trước mốc thuộc cô A, sau mốc thuộc cô B, không ai bị tính lẫn', () => {
  const cls = baseClass({
    teacherId: T2,
    teacherAssignments: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-16' },
      { teacherId: T2, teacherName: 'Cô B', fromDate: '2026-08-17', toDate: null },
    ],
  });
  const a = ledger({ teacherId: T1, classes: [cls] });
  const b = ledger({ teacherId: T2, classes: [cls] });
  assert.deepEqual(datesOf(a), ['2026-08-03', '2026-08-10'], 'cô A chỉ nhận 2 buổi trước ngày bàn giao');
  assert.deepEqual(datesOf(b), ['2026-08-17', '2026-08-24', '2026-08-31'], 'cô B nhận 3 buổi từ ngày bàn giao');
  assert.equal(total(a), 400000, 'cô A: 2 buổi × 200.000đ');
  assert.equal(total(b), 600000, 'cô B: 3 buổi × 200.000đ');
  assert.equal(total(a) + total(b), 1000000, 'tổng hai người đúng bằng tổng lương của lớp, không trùng không sót');
});

test('teacherIdOnDate khớp với cách chia buổi: ngày bàn giao đã thuộc người mới', () => {
  const cls = baseClass({
    teacherAssignments: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-16' },
      { teacherId: T2, teacherName: 'Cô B', fromDate: '2026-08-17', toDate: null },
    ],
  });
  assert.equal(teacherIdOnDate(cls, '2026-08-16'), T1, 'ngày cuối của đoạn cũ vẫn là cô A');
  assert.equal(teacherIdOnDate(cls, '2026-08-17'), T2, 'ngày đầu của đoạn mới là cô B');
  assert.equal(teacherIdOnDate(cls, '2026-08-02'), null, 'trước ngày khai giảng thì không ai phụ trách');
});

test('lớp chưa có lịch sử phân công: suy một đoạn từ giảng viên hiện tại, tính từ ngày khai giảng', () => {
  const cls = baseClass();
  assert.deepEqual(effectiveAssignments(cls), [
    { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: null },
  ], 'lớp cũ được suy thành một đoạn duy nhất mở tới hiện tại');
  assert.equal(total(ledger({ classes: [cls] })), 1000000, 'kết quả lương giữ nguyên như trước khi có teacherAssignments');
});

test('giảng viên không phụ trách lớp nào thì sổ lương rỗng', () => {
  assert.deepEqual(ledger({ teacherId: 't-khong-co', classes: [baseClass()] }), [], 'không có đoạn phụ trách thì không có dòng nào');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Khoảng trống không ai phụ trách
// ─────────────────────────────────────────────────────────────────────────────
test('lớp có khoảng trống không ai phụ trách: buổi trong khoảng đó không tính cho ai', () => {
  // Cô A tới 09/08, cô B từ 24/08 → hai buổi 10/08 và 17/08 rơi vào khoảng trống
  const cls = baseClass({
    teacherAssignments: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-09' },
      { teacherId: T2, teacherName: 'Cô B', fromDate: '2026-08-24', toDate: null },
    ],
  });
  const a = ledger({ teacherId: T1, classes: [cls] });
  const b = ledger({ teacherId: T2, classes: [cls] });
  assert.deepEqual(datesOf(a), ['2026-08-03'], 'cô A chỉ có buổi 03/08');
  assert.deepEqual(datesOf(b), ['2026-08-24', '2026-08-31'], 'cô B chỉ có 2 buổi cuối tháng');
  assert.equal(total(a) + total(b), 600000, '3 buổi được trả; 2 buổi trong khoảng trống không trả cho ai');
  assert.equal(teacherIdOnDate(cls, '2026-08-10'), null, 'ngày 10/08 nằm trong khoảng trống');
  assert.equal(teacherIdOnDate(cls, '2026-08-17'), null, 'ngày 17/08 nằm trong khoảng trống');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Lương đổi mức giữa chừng (rateHistory)
// ─────────────────────────────────────────────────────────────────────────────
test('lương đổi mức giữa chừng: buổi trước mốc lấy mức cũ, buổi từ mốc lấy mức mới', () => {
  const cls = baseClass({
    rateHistory: [{ rate: 250000, fromDate: '2026-08-17', toDate: null, teacherIds: [] }],
  });
  const items = sessionsOf(ledger({ classes: [cls] })).sort((x, y) => x.date.localeCompare(y.date));
  assert.deepEqual(
    items.map(i => [i.date, i.amount]),
    [
      ['2026-08-03', 200000], ['2026-08-10', 200000],
      ['2026-08-17', 250000], ['2026-08-24', 250000], ['2026-08-31', 250000],
    ],
    '2 buổi đầu theo mức mặc định 200k, 3 buổi từ 17/08 theo mức mới 250k',
  );
  assert.equal(total(items), 1150000, '2×200.000 + 3×250.000 = 1.150.000đ');
  assert.equal(rateAt(cls, '2026-08-16', T1), 200000, 'ngày liền trước mốc vẫn là mức cũ');
  assert.equal(rateAt(cls, '2026-08-17', T1), 250000, 'đúng ngày mốc đã là mức mới');
});

test('rateHistory gán riêng cho một giảng viên đè lên khoảng áp cho tất cả', () => {
  const cls = baseClass({
    teacherAssignments: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-16' },
      { teacherId: T2, teacherName: 'Cô B', fromDate: '2026-08-17', toDate: null },
    ],
    rateHistory: [
      { rate: 300000, fromDate: '2026-08-01', toDate: null, teacherIds: [] },      // áp cho mọi người
      { rate: 420000, fromDate: '2026-08-01', toDate: null, teacherIds: [T1] },    // riêng cô A
    ],
  });
  assert.equal(total(ledger({ teacherId: T1, classes: [cls] })), 840000, 'cô A: 2 buổi × 420.000đ (mức riêng thắng mức chung)');
  assert.equal(total(ledger({ teacherId: T2, classes: [cls] })), 900000, 'cô B: 3 buổi × 300.000đ (mức chung)');
});

test('khoảng lương hết hạn thì quay về mức mặc định của lớp', () => {
  const cls = baseClass({
    rateHistory: [{ rate: 250000, fromDate: '2026-08-03', toDate: '2026-08-17', teacherIds: [] }],
  });
  const byDate = Object.fromEntries(sessionsOf(ledger({ classes: [cls] })).map(i => [i.date, i.amount]));
  assert.equal(byDate['2026-08-17'], 250000, 'ngày cuối của khoảng vẫn hưởng mức trong khoảng');
  assert.equal(byDate['2026-08-24'], 200000, 'hết khoảng thì về ratePerSession mặc định');
  assert.equal(total(ledger({ classes: [cls] })), 1150000, '3×250.000 + 2×200.000 = 1.150.000đ');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Dạy thay
// ─────────────────────────────────────────────────────────────────────────────
test('buổi dạy thay: trừ khỏi giảng viên gốc và cộng cho người dạy thay', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'substituted', teacherName: 'Cô A', substituteTeacherId: T2, substituteRate: null,
  }];
  const a = ledger({ teacherId: T1, classes: [cls], overrides });
  const b = ledger({ teacherId: T2, classes: [cls], overrides });
  assert.deepEqual(datesOf(a), ['2026-08-03', '2026-08-10', '2026-08-24', '2026-08-31'], 'cô A mất đúng buổi 17/08');
  assert.equal(total(a), 800000, 'cô A: 4 buổi × 200.000đ');
  assert.deepEqual(datesOf(b), ['2026-08-17'], 'cô B chỉ nhận đúng buổi dạy thay');
  assert.equal(total(b), 200000, 'cô B nhận đơn giá mặc định của lớp khi không đặt mức riêng');
  assert.equal(b[0].substituteForTeacherName, 'Cô A', 'dòng dạy thay ghi lại tên giảng viên gốc');
  assert.equal(total(a) + total(b), 1000000, 'tổng lương lớp không đổi, chỉ chuyển tiền giữa hai người');
});

test('buổi dạy thay có substituteRate riêng: dùng đúng mức đó, không dùng ratePerSession', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'substituted', teacherName: 'Cô A', substituteTeacherId: T2, substituteRate: 300000,
  }];
  const b = sessionsOf(ledger({ teacherId: T2, classes: [cls], overrides }));
  assert.equal(b.length, 1, 'chỉ một buổi dạy thay');
  assert.equal(b[0].amount, 300000, 'lấy đúng substituteRate 300.000đ chứ không phải 200.000đ của lớp');
  assert.equal(b[0].substituteRate, 300000, 'sổ lương giữ lại mức dạy thay để hiển thị');
  assert.equal(total(ledger({ teacherId: T1, classes: [cls], overrides })), 800000, 'cô A vẫn chỉ mất 1 buổi theo đơn giá của chính mình');
});

test('substituteRate riêng đè cả rateHistory gán đích danh người dạy thay', () => {
  const cls = baseClass({ rateHistory: [{ rate: 500000, fromDate: '2026-08-01', toDate: null, teacherIds: [T2] }] });
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'substituted', teacherName: 'Cô A', substituteTeacherId: T2, substituteRate: 180000,
  }];
  assert.equal(total(ledger({ teacherId: T2, classes: [cls], overrides })), 180000, 'mức của riêng buổi dạy thay thắng mọi khoảng lương');
});

// NGHI VẤN: buổi 'substituted' mà chưa chọn người dạy thay thì giảng viên gốc vẫn bị trừ tiền,
// còn không ai được cộng lại — tiền của buổi đó biến mất khỏi mọi sổ lương.
test('NGHI VẤN — buổi dạy thay chưa chọn người dạy thay: cô A bị trừ mà không ai được cộng', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'substituted', teacherName: 'Cô A', substituteTeacherId: null, substituteRate: null,
  }];
  assert.equal(total(ledger({ teacherId: T1, classes: [cls], overrides })), 800000, 'cô A mất buổi 17/08');
  assert.equal(total(ledger({ teacherId: T2, classes: [cls], overrides })), 0, 'không ai nhận lại buổi đó');
});

// NGHI VẤN: buổi dạy thay được cộng thẳng cho người dạy thay mà KHÔNG kiểm tra ngày đó có nằm
// trong lịch học của lớp hay không — ghi nhầm ngày (18/08 là T3, lớp chỉ học T2) vẫn được trả tiền.
test('NGHI VẤN — buổi dạy thay ghi vào ngày không có trong lịch lớp vẫn được trả tiền', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-18', // T3, lớp học T2
    status: 'substituted', teacherName: 'Cô A', substituteTeacherId: T2, substituteRate: null,
  }];
  assert.equal(total(ledger({ teacherId: T2, classes: [cls], overrides })), 200000, 'người dạy thay vẫn được 1 buổi dù ngày đó lớp không học');
  assert.equal(total(ledger({ teacherId: T1, classes: [cls], overrides })), 1000000, 'cô A không bị trừ vì ngày đó vốn không có buổi');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Dời lịch / vắng / không dạy
// ─────────────────────────────────────────────────────────────────────────────
// NGHI VẤN: buổi 'rescheduled' VẪN được trả tiền và trả vào NGÀY GỐC, không phải ngày dời tới.
// Nếu ngày dời sang tháng/kỳ lương khác thì tiền vẫn nằm ở kỳ của ngày gốc.
test('NGHI VẤN — buổi dời lịch vẫn được tính tiền và tính vào NGÀY GỐC', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'rescheduled', rescheduledDate: '2026-09-19', rescheduledTime: '19:30',
  }];
  const items = ledger({ classes: [cls], overrides });
  assert.equal(total(items), 1000000, 'dời lịch không làm giảm lương');
  assert.ok(items.some(i => i.date === '2026-08-17'), 'dòng tiền nằm ở ngày gốc 17/08');
  assert.ok(!items.some(i => i.date === '2026-09-19'), 'không có dòng nào ở ngày dời tới 19/09');
  assert.equal(payPeriodLabel('2026-08-17'), '2026-08', 'tiền rơi vào kỳ lương của ngày gốc');
  assert.equal(payPeriodLabel('2026-09-19'), '2026-09', 'ngày dời tới thuộc kỳ khác nhưng không được dùng');
});

// NGHI VẤN: dời buổi sang một ngày VỐN ĐÃ CÓ LỊCH học thì hệ thống trả tiền cả buổi gốc (vì
// 'rescheduled' vẫn tính) lẫn buổi ở ngày đích — giảng viên được trả 5 buổi cho 4 buổi thực dạy.
test('NGHI VẤN — dời buổi sang ngày đã có lịch: trả tiền cả ngày gốc lẫn ngày đích', () => {
  const cls = baseClass();
  const overrides = [{
    _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17',
    status: 'rescheduled', rescheduledDate: '2026-08-24', // 24/08 là T2, vốn đã có buổi
  }];
  const items = ledger({ classes: [cls], overrides });
  assert.equal(items.length, 5, 'vẫn đủ 5 dòng, gồm cả 17/08 (đã dời đi) và 24/08 (ngày đích)');
  assert.equal(total(items), 1000000, 'thực dạy 4 buổi nhưng trả tiền 5 buổi');
});

test("buổi 'absent' và 'not-taught' không được tính tiền", () => {
  const cls = baseClass();
  const overrides = [
    { _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-10', status: 'absent' },
    { _id: 's2', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-24', status: 'not-taught' },
  ];
  const items = ledger({ classes: [cls], overrides });
  assert.deepEqual(datesOf(items), ['2026-08-03', '2026-08-17', '2026-08-31'], 'hai buổi 10/08 và 24/08 bị loại');
  assert.equal(total(items), 600000, 'chỉ còn 3 buổi × 200.000đ');

  const raw = buildTeacherSessions(T1, [cls], overrides, TODAY);
  const byDate = Object.fromEntries(raw.map(s => [s.date, s.status]));
  assert.equal(byDate['2026-08-10'], 'absent', "buổi vẫn xuất hiện trong danh sách buổi dạy với trạng thái 'absent'");
  assert.equal(byDate['2026-08-24'], 'not-taught', "buổi vẫn xuất hiện với trạng thái 'not-taught'");
});

test("ngoại lệ trạng thái 'taught' không đổi gì so với mặc định", () => {
  const cls = baseClass();
  const overrides = [{ _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-10', status: 'taught' }];
  assert.equal(total(ledger({ classes: [cls], overrides })), 1000000, 'đánh dấu đã dạy vẫn là 5 buổi đủ tiền');
});

test('ngoại lệ của lớp khác không ảnh hưởng lớp này', () => {
  const cls = baseClass();
  const overrides = [{ _id: 's1', classId: 'c-khac', className: 'Lớp khác', date: '2026-08-10', status: 'not-taught' }];
  assert.equal(total(ledger({ classes: [cls], overrides })), 1000000, 'bản ghi của lớp khác không trừ lương lớp này');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Lớp nhiều khoá nối tiếp
// ─────────────────────────────────────────────────────────────────────────────
test('lớp nhiều khoá nối tiếp, mỗi khoá lịch riêng: số buổi và ngày dạy đúng theo từng khoá', () => {
  // Khoá A: T2, 03/08 → 17/08  → 03, 10, 17
  // Khoá B: T4, 24/08 → 09/09  → 26/08, 02/09, 09/09
  const cls = baseClass({
    startDate: '2026-08-03', endDate: '2026-09-09',
    phases: [
      { courseTitle: 'TOPIK I', courseCategory: 'topik', days: 'T2', time: '19:30 - 21:30', fromDate: '2026-08-03', toDate: '2026-08-17' },
      { courseTitle: 'GIAO TIẾP', courseCategory: 'conversation', days: 'T4', time: '18:00 - 20:00', fromDate: '2026-08-24', toDate: '2026-09-09' },
    ],
  });
  assert.deepEqual(
    scheduledDatesOfClass(cls, TODAY),
    ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-26', '2026-09-02', '2026-09-09'],
    'khoá A sinh 3 buổi T2, khoá B sinh 3 buổi T4, không lẫn lịch của nhau',
  );
  const items = ledger({ classes: [cls] });
  assert.equal(items.length, 6, 'tổng 6 buổi qua hai khoá');
  assert.equal(total(items), 1200000, '6 buổi × 200.000đ');
  assert.equal(phaseAt(cls, '2026-08-10').courseTitle, 'TOPIK I', 'buổi 10/08 thuộc khoá A');
  assert.equal(phaseAt(cls, '2026-09-02').courseTitle, 'GIAO TIẾP', 'buổi 02/09 thuộc khoá B');
});

test('ngày nằm giữa hai khoá (quãng nghỉ): không sinh buổi dạy', () => {
  // Nghỉ 18/08 → 30/08: ngày 24/08 là T2 nhưng không thuộc khoá nào
  const cls = baseClass({
    startDate: '2026-08-03', endDate: '2026-09-14',
    phases: [
      { courseTitle: 'TOPIK I', days: 'T2', time: '19:30', fromDate: '2026-08-03', toDate: '2026-08-17' },
      { courseTitle: 'TOPIK II', days: 'T2', time: '19:30', fromDate: '2026-08-31', toDate: '2026-09-14' },
    ],
  });
  const dates = scheduledDatesOfClass(cls, TODAY);
  assert.ok(!dates.includes('2026-08-24'), 'ngày 24/08 (T2) rơi vào quãng nghỉ nên không sinh buổi');
  assert.deepEqual(dates, ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-31', '2026-09-07', '2026-09-14'],
    'chỉ các ngày T2 nằm trong hai khoá mới sinh buổi');
  assert.equal(phaseAt(cls, '2026-08-24'), null, 'ngày nghỉ không thuộc giai đoạn nào');
  assert.equal(total(ledger({ classes: [cls] })), 1200000, '6 buổi × 200.000đ, không trả tiền ngày nghỉ');
});

test('đổi giảng viên đúng mốc sang khoá mới: mỗi người ăn lương của khoá mình dạy', () => {
  const cls = baseClass({
    startDate: '2026-08-03', endDate: '2026-09-09',
    phases: [
      { courseTitle: 'TOPIK I', days: 'T2', time: '19:30', fromDate: '2026-08-03', toDate: '2026-08-17' },
      { courseTitle: 'GIAO TIẾP', days: 'T4', time: '18:00', fromDate: '2026-08-24', toDate: '2026-09-09' },
    ],
    teacherAssignments: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-23' },
      { teacherId: T2, teacherName: 'Cô B', fromDate: '2026-08-24', toDate: null },
    ],
    rateHistory: [{ rate: 260000, fromDate: '2026-08-24', toDate: null, teacherIds: [] }],
  });
  assert.equal(total(ledger({ teacherId: T1, classes: [cls] })), 600000, 'cô A dạy 3 buổi khoá A × 200.000đ');
  assert.equal(total(ledger({ teacherId: T2, classes: [cls] })), 780000, 'cô B dạy 3 buổi khoá B × 260.000đ (mức mới)');
});

test('lớp chưa có phases được suy thành một giai đoạn từ chính lớp', () => {
  const p = effectivePhases(baseClass());
  assert.equal(p.length, 1, 'đúng một giai đoạn suy ra');
  assert.deepEqual(
    { days: p[0].days, from: p[0].fromDate, to: p[0].toDate, course: p[0].courseTitle },
    { days: 'T2', from: '2026-08-03', to: '2026-08-31', course: 'TOPIK I' },
    'giai đoạn suy ra lấy đúng lịch, ngày và khoá của lớp',
  );
});

// NGHI VẤN: giai đoạn còn mở (toDate = null) sinh buổi tới tận ngày chốt truyền vào, nên lớp
// đã kết thúc thực tế nhưng quên đóng ngày vẫn tiếp tục phát sinh lương mỗi tuần.
test('NGHI VẤN — giai đoạn chưa đóng ngày kết thúc vẫn sinh buổi tới hôm nay', () => {
  const cls = baseClass({ endDate: null, phases: [{ courseTitle: 'A', days: 'T2', time: '', fromDate: '2026-09-07', toDate: null }] });
  assert.deepEqual(scheduledDatesOfClass(cls, TODAY), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'],
    'lấy hết ngày T2 từ 07/09 tới ngày chốt 30/09');
  assert.equal(total(ledger({ classes: [cls] })), 800000, '4 buổi × 200.000đ');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. scheduledDates (hàm sinh ngày dùng chung)
// ─────────────────────────────────────────────────────────────────────────────
test('scheduledDates sinh đúng ngày theo danh sách thứ, bao gồm cả hai đầu khoảng', () => {
  assert.deepEqual(scheduledDates('2026-08-03', '2026-08-31', 'T2'),
    ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'], 'các ngày T2 của tháng 8');
  assert.deepEqual(scheduledDates('2026-08-03', '2026-08-12', 'T2,T4'),
    ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12'], 'T2 và T4 xen kẽ theo đúng thứ tự ngày');
  assert.deepEqual(scheduledDates('2026-08-03', '2026-08-31', 'CN'),
    ['2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'], 'Chủ nhật được hiểu là CN');
});

test('scheduledDates trả mảng rỗng khi thiếu dữ liệu hoặc thứ không hợp lệ', () => {
  assert.deepEqual(scheduledDates('', '2026-08-31', 'T2'), [], 'thiếu ngày bắt đầu');
  assert.deepEqual(scheduledDates('2026-08-03', '', 'T2'), [], 'thiếu ngày kết thúc');
  assert.deepEqual(scheduledDates('2026-08-03', '2026-08-31', ''), [], 'thiếu thứ học');
  assert.deepEqual(scheduledDates('2026-08-03', '2026-08-31', 'T9'), [], 'thứ không hợp lệ thì không sinh buổi nào');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Bản ghi trùng (lớp, ngày)
// ─────────────────────────────────────────────────────────────────────────────
test('hai bản ghi trùng (lớp, ngày): chỉ bản sửa gần nhất có hiệu lực', () => {
  const cls = baseClass();
  const cu = { _id: 'x1', classId: 'c1', className: 'VIP200426', date: '2026-08-10', status: 'not-taught', updatedAt: '2026-08-11T00:00:00Z' };
  const moi = { _id: 'x2', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-10', status: 'taught', updatedAt: '2026-08-20T00:00:00Z' };
  assert.equal(latestPerClassDate([cu, moi], [cls]).length, 1, 'cùng lớp + ngày thì gom lại còn một bản');
  assert.equal(latestPerClassDate([cu, moi], [cls])[0]._id, 'x2', 'bản sửa gần nhất thắng');
  assert.equal(latestPerClassDate([moi, cu], [cls])[0]._id, 'x2', 'đảo thứ tự mảng vẫn ra bản sửa gần nhất');
  assert.equal(total(ledger({ classes: [cls], overrides: [cu, moi] })), 1000000, 'bản mới nhất là đã dạy nên đủ 5 buổi');
  assert.equal(total(ledger({ classes: [cls], overrides: [moi, cu] })), 1000000, 'kết quả không phụ thuộc thứ tự dữ liệu trả về');
});

test('bản ghi trùng nhưng bản mới nhất là không dạy thì buổi đó bị trừ', () => {
  const cls = baseClass();
  const cu = { _id: 'x1', classId: 'c1', className: 'VIP200426', date: '2026-08-10', status: 'taught', updatedAt: '2026-08-11T00:00:00Z' };
  const moi = { _id: 'x2', classId: 'c1', className: 'VIP200426', date: '2026-08-10', status: 'not-taught', updatedAt: '2026-08-20T00:00:00Z' };
  assert.equal(total(ledger({ classes: [cls], overrides: [cu, moi] })), 800000, 'mất buổi 10/08, còn 4 buổi');
});

// ĐÃ VÁ (2026-09-17): trước đây `>=` làm bản ĐỨNG SAU trong mảng thắng, nên kết quả phụ
// thuộc thứ tự dữ liệu trả về từ DB — backend lấy không sort, frontend nhận bản đã sort
// theo ngày, hai bên chọn hai bản khác nhau và ra hai con số lương khác nhau. Nay hoà mốc
// sửa thì _id lớn hơn thắng: thứ tự toàn phần, không phụ thuộc đầu vào.
test('hai bản ghi trùng có CÙNG mốc sửa: bản thắng không phụ thuộc thứ tự mảng', () => {
  const cls = baseClass();
  const a = { _id: 'x1', classId: 'c1', className: 'VIP200426', date: '2026-08-10', status: 'not-taught', updatedAt: '2026-08-20T00:00:00Z' };
  const b = { _id: 'x2', classId: 'c1', className: 'VIP200426', date: '2026-08-10', status: 'taught', updatedAt: '2026-08-20T00:00:00Z' };
  assert.equal(latestPerClassDate([a, b], [cls])[0]._id, 'x2');
  assert.equal(latestPerClassDate([b, a], [cls])[0]._id, 'x2', 'đảo thứ tự vẫn cùng một bản thắng');
});

test('editedAt lấy updatedAt, không có thì createdAt, không có nữa thì suy từ ObjectId', () => {
  assert.equal(editedAt({ updatedAt: '2026-08-20T00:00:00Z', createdAt: '2026-08-01T00:00:00Z' }),
    Date.parse('2026-08-20T00:00:00Z'), 'ưu tiên updatedAt');
  assert.equal(editedAt({ createdAt: '2026-08-01T00:00:00Z' }), Date.parse('2026-08-01T00:00:00Z'), 'không có updatedAt thì lấy createdAt');
  // 8 ký tự đầu của ObjectId là timestamp giây: 0x68c00000 giây
  const id = '68c000000000000000000000';
  assert.equal(editedAt({ _id: id }), parseInt('68c00000', 16) * 1000, 'suy thời điểm tạo từ ObjectId');
  assert.equal(editedAt({ _id: 'khong-phai-objectid' }), 0, 'id không hợp lệ thì coi như cũ nhất');
});

test('bản ghi cũ chưa có classId vẫn nối với lớp theo tên lớp hiện tại', () => {
  const cls = baseClass();
  assert.equal(total(ledger({ classes: [cls], overrides: [{ _id: 'x1', className: 'VIP200426 - Mango', date: '2026-08-10', status: 'not-taught' }] })),
    800000, 'trùng tên lớp hiện tại thì áp dụng được');
  assert.equal(total(ledger({ classes: [cls], overrides: [{ _id: 'x1', className: 'VIP200426', date: '2026-08-10', status: 'not-taught' }] })),
    1000000, 'tên lớp cũ (đã đổi tên) thì không áp dụng được');
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Kỳ lương (mốc ngày 10)
// ─────────────────────────────────────────────────────────────────────────────
test('mốc kỳ lương mặc định là ngày 10', () => {
  assert.equal(DEFAULT_PAY_PERIOD_START_DAY, 10, 'kỳ lương bắt đầu ngày 10 hằng tháng');
});

test('kỳ lương ngày 10: ngày 9 thuộc kỳ tháng trước, ngày 10 thuộc kỳ tháng này', () => {
  assert.equal(payPeriodLabel('2026-09-09'), '2026-08', '09/09 còn thuộc kỳ tháng 8');
  assert.equal(payPeriodLabel('2026-09-10'), '2026-09', '10/09 mở kỳ tháng 9');
  assert.equal(payPeriodLabel('2026-09-30'), '2026-09', 'cuối tháng vẫn thuộc kỳ tháng 9');
  assert.equal(payPeriodLabel('2026-10-01'), '2026-09', '01/10 vẫn nằm trong kỳ tháng 9');
});

test('kỳ lương bắc qua tháng 1: ngày 09/01 thuộc kỳ tháng 12 năm trước', () => {
  assert.equal(payPeriodLabel('2026-01-09'), '2025-12', '09/01/2026 thuộc kỳ 12/2025');
  assert.equal(payPeriodLabel('2026-01-10'), '2026-01', '10/01/2026 mở kỳ 01/2026');
  assert.deepEqual(payPeriodBounds('2025-12'), { start: '2025-12-10', end: '2026-01-09' }, 'kỳ 12/2025 chạy 10/12 → 09/01');
  assert.deepEqual(payPeriodBounds('2026-01'), { start: '2026-01-10', end: '2026-02-09' }, 'kỳ 01/2026 chạy 10/01 → 09/02');
});

test('payPeriodBounds và payPeriodLabel khớp nhau ở cả hai đầu kỳ', () => {
  const { start, end } = payPeriodBounds('2026-08');
  assert.deepEqual({ start, end }, { start: '2026-08-10', end: '2026-09-09' }, 'kỳ 08/2026 chạy 10/08 → 09/09');
  assert.equal(payPeriodLabel(start), '2026-08', 'ngày đầu kỳ quy về đúng kỳ đó');
  assert.equal(payPeriodLabel(end), '2026-08', 'ngày cuối kỳ quy về đúng kỳ đó');
});

test('mốc kỳ lương tuỳ chỉnh (không phải ngày 10) vẫn đúng', () => {
  assert.equal(payPeriodLabel('2026-09-04', 5), '2026-08', 'với mốc ngày 5 thì 04/09 thuộc kỳ tháng 8');
  assert.equal(payPeriodLabel('2026-09-05', 5), '2026-09', 'với mốc ngày 5 thì 05/09 mở kỳ tháng 9');
  assert.deepEqual(payPeriodBounds('2026-09', 5), { start: '2026-09-05', end: '2026-10-04' }, 'kỳ chạy 05/09 → 04/10');
});

test('buổi dạy được xếp vào kỳ lương theo đúng ngày dạy, cắt ngang mốc ngày 10', () => {
  // Lịch T4,T5 từ 09/09 tới 10/09 → 09/09 (T4) và 10/09 (T5) nằm ở hai kỳ khác nhau
  const cls = baseClass({ days: 'T4,T5', startDate: '2026-09-09', endDate: '2026-09-10' });
  const items = sessionsOf(ledger({ classes: [cls] }));
  const theoKy = {};
  for (const i of items) theoKy[payPeriodLabel(i.date)] = (theoKy[payPeriodLabel(i.date)] || 0) + i.amount;
  assert.deepEqual(theoKy, { '2026-08': 200000, '2026-09': 200000 }, 'buổi 09/09 vào kỳ tháng 8, buổi 10/09 vào kỳ tháng 9');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Thưởng / phạt / hoa hồng
// ─────────────────────────────────────────────────────────────────────────────
test('thưởng và phạt cộng/trừ đúng vào sổ lương', () => {
  const cls = baseClass();
  const bonuses = [
    { type: 'bonus', amount: 500000, date: '2026-08-20', className: 'VIP200426 - Mango', note: 'Thưởng lớp đầy' },
    { type: 'penalty', amount: 150000, date: '2026-08-25', className: 'VIP200426 - Mango', note: 'Đi muộn' },
  ];
  const items = ledger({ classes: [cls], bonuses });
  assert.equal(total(items), 1000000 + 500000 - 150000, 'lương buổi + thưởng − phạt = 1.350.000đ');
  const thuong = items.find(i => i.kind === 'bonus');
  const phat = items.find(i => i.kind === 'penalty');
  assert.equal(thuong.amount, 500000, 'thưởng vào sổ là số dương');
  assert.equal(phat.amount, -150000, 'phạt vào sổ là số âm');
  assert.equal(phat.note, 'Đi muộn', 'giữ nguyên ghi chú để hiển thị');
  assert.equal(sessionsOf(items).length, 5, 'thưởng/phạt không làm đổi số buổi dạy');
});

test('thưởng/phạt được tính kể cả khi không gắn lớp và không phụ thuộc ngày có lịch dạy', () => {
  const cls = baseClass();
  const bonuses = [{ type: 'bonus', amount: 300000, date: '2026-08-18', className: '', note: '' }]; // 18/08 là T3, không có lịch
  const items = ledger({ classes: [cls], bonuses });
  assert.equal(total(items), 1300000, 'thưởng vẫn cộng đủ dù ngày đó lớp không học');
  assert.equal(items.find(i => i.kind === 'bonus').className, '', 'không gắn lớp thì để trống tên lớp');
});

test('hoa hồng giới thiệu cộng vào sổ lương với ghi chú tên học viên', () => {
  const cls = baseClass();
  const commissions = [{ amount: 400000, date: '2026-08-15', referredStudentName: 'Nguyễn Văn A' }];
  const items = ledger({ classes: [cls], commissions });
  const hh = items.find(i => i.kind === 'commission');
  assert.equal(total(items), 1400000, 'lương buổi + hoa hồng');
  assert.equal(hh.amount, 400000, 'hoa hồng là số dương');
  assert.match(hh.note, /Nguyễn Văn A/, 'ghi chú kèm tên học viên được giới thiệu');
});

test('thưởng và phạt được xếp vào kỳ lương theo ngày áp dụng', () => {
  const bonuses = [
    { type: 'bonus', amount: 100000, date: '2026-09-09', className: '', note: '' },
    { type: 'penalty', amount: 100000, date: '2026-09-10', className: '', note: '' },
  ];
  const items = ledger({ classes: [], bonuses });
  assert.equal(payPeriodLabel(items[0].date), '2026-08', 'thưởng ngày 09/09 thuộc kỳ tháng 8');
  assert.equal(payPeriodLabel(items[1].date), '2026-09', 'phạt ngày 10/09 thuộc kỳ tháng 9');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Kiểm tra dữ liệu đầu vào (validate)
// ─────────────────────────────────────────────────────────────────────────────
test('validatePhases chặn giai đoạn chồng ngày và thiếu dữ liệu bắt buộc', () => {
  assert.throws(() => validatePhases([
    { courseTitle: 'A', fromDate: '2026-08-03', toDate: '2026-08-31', days: 'T2' },
    { courseTitle: 'B', fromDate: '2026-08-17', toDate: null, days: 'T4' },
  ]), /chồng/i, 'hai khoá chồng ngày phải bị chặn');
  assert.throws(() => validatePhases([
    { courseTitle: 'A', fromDate: '2026-08-03', toDate: '2026-08-31', days: 'T2' },
    { courseTitle: 'B', fromDate: '2026-08-31', toDate: null, days: 'T4' },
  ]), /chồng/i, 'trùng đúng một ngày cũng là chồng ngày');
  assert.throws(() => validatePhases([{ fromDate: '2026-08-03', days: 'T2' }]), /khoá học/i, 'thiếu tên khoá');
  assert.throws(() => validatePhases([{ courseTitle: 'A', days: 'T2' }]), /ngày bắt đầu/i, 'thiếu ngày bắt đầu');
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '03/08/2026', days: 'T2' }]), /ngày bắt đầu/i, 'sai định dạng ngày');
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '2026-08-31', toDate: '2026-08-03', days: 'T2' }]), /kết thúc/i, 'ngày kết thúc trước ngày bắt đầu');
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '2026-08-03', days: '' }]), /thứ học/i, 'thiếu thứ học');
  assert.doesNotThrow(() => validatePhases([
    { courseTitle: 'A', fromDate: '2026-08-03', toDate: '2026-08-17', days: 'T2' },
    { courseTitle: 'B', fromDate: '2026-08-18', toDate: null, days: 'T4' },
  ]), 'hai khoá nối tiếp không chồng ngày thì hợp lệ');
});

// ĐÃ VÁ (2026-09-17): trước đây validatePhases nhận mọi chuỗi `days`, nên nhập 'T9' lưu được và
// lớp đó lặng lẽ không sinh buổi dạy nào — giảng viên mất lương mà không có lỗi nào. Nay chặn ngay.
test('validatePhases chặn mã thứ không hợp lệ — trước đây lớp lặng lẽ mất sạch buổi dạy', () => {
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '2026-08-03', toDate: '2026-08-31', days: 'T9' }]),
    /T9/, "mã thứ 'T9' phải bị chặn");
  // Vì sao phải chặn: nếu lọt qua thì hậu quả là đây — không buổi nào, lương về 0, không cảnh báo.
  const cls = baseClass({ phases: [{ courseTitle: 'A', days: 'T9', time: '', fromDate: '2026-08-03', toDate: '2026-08-31' }] });
  assert.deepEqual(scheduledDatesOfClass(cls, TODAY), [], 'không sinh buổi nào');
  assert.equal(total(ledger({ classes: [cls] })), 0, 'lương về 0');
});

test('validateRateHistory chặn mức lương <= 0, thiếu ngày và khoảng chồng nhau cùng phạm vi', () => {
  assert.throws(() => validateRateHistory([{ rate: 0, fromDate: '2026-08-03' }]), /mức lương/i, 'mức 0 không hợp lệ');
  assert.throws(() => validateRateHistory([{ rate: -100000, fromDate: '2026-08-03' }]), /mức lương/i, 'mức âm không hợp lệ');
  assert.throws(() => validateRateHistory([{ rate: 200000 }]), /ngày bắt đầu/i, 'thiếu ngày bắt đầu áp dụng');
  assert.throws(() => validateRateHistory([{ rate: 200000, fromDate: '2026-08-03', toDate: '03/09/2026' }]), /kết thúc/i, 'ngày kết thúc sai định dạng');
  assert.throws(() => validateRateHistory([{ rate: 200000, fromDate: '2026-08-31', toDate: '2026-08-03' }]), /kết thúc/i, 'ngày kết thúc trước ngày bắt đầu');
  assert.throws(() => validateRateHistory([
    { rate: 200000, fromDate: '2026-08-03', toDate: '2026-08-31', teacherIds: [] },
    { rate: 250000, fromDate: '2026-08-17', toDate: null, teacherIds: [] },
  ]), /chồng/i, 'hai khoảng cùng áp cho mọi giảng viên mà chồng ngày thì bị chặn');
  assert.doesNotThrow(() => validateRateHistory([
    { rate: 200000, fromDate: '2026-08-03', toDate: null, teacherIds: [T1] },
    { rate: 250000, fromDate: '2026-08-03', toDate: null, teacherIds: [T2] },
  ]), 'khác phạm vi giảng viên thì được phép chồng ngày');
  assert.doesNotThrow(() => validateRateHistory([
    { rate: 200000, fromDate: '2026-08-03', toDate: null, teacherIds: [] },
    { rate: 250000, fromDate: '2026-08-03', toDate: null, teacherIds: [T1] },
  ]), 'mức riêng của giảng viên được phép đè lên mức chung');
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Đối chiếu số đã trả (paymentVerify)
// ─────────────────────────────────────────────────────────────────────────────
test('isAbnormalPayment: lệch dưới 1đ coi như bằng, từ 1đ trở lên là bất thường', () => {
  assert.equal(isAbnormalPayment(1000000, 1000000), false, 'trả đúng số tự tính');
  assert.equal(isAbnormalPayment(1000000.5, 1000000), false, 'lệch 0,5đ do làm tròn — không bất thường');
  assert.equal(isAbnormalPayment(1000000, 1000000.99), false, 'lệch 0,99đ — vẫn coi như bằng');
  assert.equal(isAbnormalPayment(1000001, 1000000), true, 'lệch đúng 1đ đã là bất thường');
  assert.equal(isAbnormalPayment(1000000, 1000001), true, 'lệch 1đ theo chiều ngược lại cũng bất thường');
  assert.equal(isAbnormalPayment(1000000, 0), true, 'tính ra tiền mà chưa trả đồng nào là bất thường');
  assert.equal(isAbnormalPayment(0, 0), false, 'không tính ra tiền và không trả gì thì bình thường');
});

test('đã kiểm bị bỏ khi số tiền đã trả thay đổi, giữ nguyên khi chỉ sửa ghi chú', () => {
  assert.equal(verifiedAfterUpsert({ amountPaid: 1000000, verified: true }, { amountPaid: 1000000 }), true, 'số tiền không đổi thì giữ đã kiểm');
  assert.equal(verifiedAfterUpsert({ amountPaid: 1000000, verified: true }, { amountPaid: 1200000 }), false, 'đổi số tiền thì phải kiểm lại');
  assert.equal(verifiedAfterUpsert(null, { amountPaid: 1000000 }), false, 'bản ghi mới chưa kiểm');
  assert.equal(verifiedAfterUpsert({ amountPaid: 1000000, verified: false }, { amountPaid: 1000000 }), false, 'chưa từng kiểm thì vẫn chưa kiểm');
});

test('sổ lương và số đã trả khớp nhau thì không bị coi là bất thường', () => {
  const cls = baseClass();
  const bonuses = [{ type: 'penalty', amount: 100000, date: '2026-08-25', className: '', note: '' }];
  const tinh = total(ledger({ classes: [cls], bonuses }));
  assert.equal(tinh, 900000, '1.000.000đ lương buổi − 100.000đ phạt');
  assert.equal(isAbnormalPayment(tinh, 900000), false, 'trả đúng 900.000đ là bình thường');
  assert.equal(isAbnormalPayment(tinh, 1000000), true, 'trả thừa 100.000đ (quên trừ phạt) là bất thường');
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Lương đi vào chi phí (nối payroll → báo cáo chi phí)
// ─────────────────────────────────────────────────────────────────────────────
test('khoản chi lương xếp vào tháng của NGÀY CHI, không theo kỳ lương', () => {
  // Lương kỳ 08/2026 (10/08 → 09/09) thường được chi vào đầu tháng 9
  const chi = [{ category: 'salary', amount: 1000000, month: '2026-08', paidAt: new Date('2026-09-12T03:00:00Z') }];
  const { byMonth, total: tong } = bucketExpenses(chi, {});
  assert.deepEqual(Object.keys(byMonth), ['2026-09'], 'khoản chi lương thuộc tháng 9 vì chi ngày 12/09');
  assert.equal(byMonth['2026-09'].salary, 1000000, 'vào đúng ô chi phí lương');
  assert.equal(byMonth['2026-09'].total, 1000000, 'cộng vào tổng chi của tháng 9');
  assert.equal(tong, 1000000, 'tổng chi toàn khoảng');
  assert.equal(expenseMonthKey(chi[0]), '2026-09', 'nhãn tháng 8 nhập tay không được dùng');
});

test('lọc chi phí theo khoảng ngày chi loại bỏ khoản trả lương ngoài khoảng', () => {
  const chi = [
    { category: 'salary', amount: 1000000, month: '2026-09', paidAt: new Date('2026-09-12T03:00:00Z') },
    { category: 'salary', amount: 900000, month: '2026-08', paidAt: new Date('2026-08-12T03:00:00Z') },
  ];
  const { byMonth, total: tong } = bucketExpenses(chi, { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(tong, 1000000, 'chỉ lấy khoản chi trong tháng 9');
  assert.deepEqual(Object.keys(byMonth), ['2026-09'], 'không có tháng nào khác lọt vào');
});

// NGHI VẤN: loại chi phí lạ (không nằm trong salary/rent/marketing/utilities/other) tạo thêm một
// khoá mới trong ô chi phí thay vì gộp vào 'other' — báo cáo cộng vào `total` nhưng không hiển
// thị ở bất kỳ mục nào, nên chi phí "biến mất" khỏi phần cơ cấu.
test('NGHI VẤN — loại chi phí lạ tạo khoá riêng thay vì gộp vào "other"', () => {
  const { byMonth } = bucketExpenses([{ category: 'luong-day-them', amount: 500000, month: '2026-09', paidAt: new Date('2026-09-12T03:00:00Z') }], {});
  assert.equal(byMonth['2026-09']['luong-day-them'], 500000, 'tạo hẳn khoá mới theo tên loại');
  assert.equal(byMonth['2026-09'].other, 0, "không được gộp vào 'other'");
  assert.equal(byMonth['2026-09'].total, 500000, 'nhưng vẫn cộng vào tổng chi');
});

test('khoản chi không có loại thì được xếp vào "other"', () => {
  const { byMonth } = bucketExpenses([{ amount: 500000, month: '2026-09', paidAt: new Date('2026-09-12T03:00:00Z') }], {});
  assert.equal(byMonth['2026-09'].other, 500000, 'bỏ trống loại thì rơi vào chi phí khác');
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Kịch bản tổng hợp — chốt con số cuối cùng của một kỳ lương
// ─────────────────────────────────────────────────────────────────────────────
test('kịch bản tổng hợp: một kỳ lương có đổi mức, dạy thay, vắng, dời lịch, thưởng và phạt', () => {
  // Lớp T2 03/08 → 31/08, 200k/buổi, từ 17/08 lên 250k.
  //   03/08 dạy thường  → 200.000
  //   10/08 vắng        → 0
  //   17/08 dạy thay cô B (mức riêng 180k) → cô A 0, cô B 180.000
  //   24/08 dời lịch    → 250.000 (vẫn tính, tính vào ngày gốc)
  //   31/08 dạy thường  → 250.000
  //   Thưởng 500.000, phạt 150.000
  const cls = baseClass({ rateHistory: [{ rate: 250000, fromDate: '2026-08-17', toDate: null, teacherIds: [] }] });
  const overrides = [
    { _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-10', status: 'absent', updatedAt: '2026-08-10T10:00:00Z' },
    { _id: 's2', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-17', status: 'substituted', teacherName: 'Cô A', substituteTeacherId: T2, substituteRate: 180000, updatedAt: '2026-08-17T10:00:00Z' },
    { _id: 's3', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-08-24', status: 'rescheduled', rescheduledDate: '2026-08-26', updatedAt: '2026-08-24T10:00:00Z' },
  ];
  const bonuses = [
    { type: 'bonus', amount: 500000, date: '2026-08-20', className: 'VIP200426 - Mango', note: '' },
    { type: 'penalty', amount: 150000, date: '2026-08-22', className: 'VIP200426 - Mango', note: '' },
  ];
  const a = ledger({ teacherId: T1, classes: [cls], overrides, bonuses });
  assert.equal(sessionsOf(a).length, 3, 'cô A còn 3 buổi được trả (03, 24 dời lịch, 31)');
  assert.equal(total(sessionsOf(a)), 700000, '200.000 + 250.000 + 250.000 = 700.000đ');
  assert.equal(total(a), 1050000, 'cộng thưởng 500.000, trừ phạt 150.000 → 1.050.000đ');

  const b = ledger({ teacherId: T2, classes: [cls], overrides });
  assert.equal(total(b), 180000, 'cô B chỉ nhận đúng mức dạy thay 180.000đ');

  // Chia sổ lương của cô A theo kỳ: buổi 03/08 nằm trước mốc ngày 10 nên rơi về kỳ 07/2026
  const theoKy = {};
  for (const i of a) {
    const k = payPeriodLabel(i.date);
    theoKy[k] = (theoKy[k] || 0) + i.amount;
  }
  assert.deepEqual(theoKy, { '2026-07': 200000, '2026-08': 850000 },
    'buổi 03/08 thuộc kỳ 07/2026 (200.000đ); phần còn lại 250.000 + 250.000 + 500.000 − 150.000 = 850.000đ thuộc kỳ 08/2026');
});
