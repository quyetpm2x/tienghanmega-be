// TƯƠNG TÁC giữa "khoá học của lớp" (Class.phases[].teachers[]) và phần còn lại của hệ
// thống: số buổi dạy, sổ lương xuyên nhiều khoá, doanh thu/chi phí, cơ chế chống bản ghi
// mồ côi (phaseDiff + classDate), và buổi dời lịch cắt ngang hai khoá.
//
// Mọi test ở đây mô tả code ĐANG CHẠY, không phải code "nên chạy". Chỗ nào hành vi hiện
// tại đáng ngờ thì đánh dấu `// NGHI VẤN:` ngay trên test và KHÔNG sửa source.
// Test đơn lẻ từng file đã có ở: classPhase / classRate / classDate / classAssignment /
// phaseDiff / phaseTeachers / phaseTeacherMigration / sessionPay / sessionPayLedger /
// payrollRegression / revenueModel / expenseBucket. File này chỉ phủ chỗ chúng GẶP NHAU.
//
// ─── Lịch 2026 dùng trong fixture (đã kiểm tay) ──────────────────────────────────────
//   Tháng 8: T2 = 03, 10, 17, 24, 31 | T4 = 05, 12, 19, 26 | T5 = 06, 13, 20, 27
//            01/08 = T7, 02/08 = CN
//   Tháng 9: T2 = 07, 14, 21, 28 | T4 = 02, 09, 16, 23, 30 | T5 = 03, 10, 17, 24
//   Mốc kỳ lương mặc định là ngày 10: 03/08 thuộc kỳ "2026-07", 10/08 thuộc kỳ "2026-08".
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scheduledDatesOfClass, classFieldsFromPhases, phaseAt, validatePhases,
} = require('../src/utils/classPhase');
const { isValidClassDate, isScheduledDate } = require('../src/utils/classDate');
const { rateAt } = require('../src/utils/classRate');
const { teacherIdOnDate, effectiveAssignments } = require('../src/utils/classAssignment');
const { resolveSession } = require('../src/utils/sessionPay');
const { diffPhases } = require('../src/utils/phaseDiff');
const { buildTeacherLedger, payPeriodLabel } = require('../src/utils/teacherLedger');
const { packageFacts, aggregateByMonth, bucketExpenses } = require('../src/utils/revenueModel');
const { monthOfPaidAt } = require('../src/utils/expenseInput');
const { priceItems } = require('../src/utils/packageMath');
const { categoryOf } = require('../src/utils/courseCategory');

const T1 = 't1'; // Cô A — dạy khoá 1
const T2 = 't2'; // Cô B — dạy khoá 2
const T3 = 't3'; // Cô C — nhận nửa sau khoá 1
const TODAY = '2026-09-30';

// Lớp xương sống của cả file: HAI khoá nối tiếp, có quãng nghỉ 01/09 → 15/09.
//   Khoá 1 "TOPIK I"   — T2, 03/08 → 31/08, cô A, 200k/buổi  (5 buổi)
//   (quãng nghỉ)
//   Khoá 2 "GIAO TIẾP" — T4, 16/09 → 30/09, cô B, 300k/buổi  (3 buổi: 16, 23, 30)
const twoPhaseClass = (extra = {}) => ({
  _id: 'C1', name: 'VIP0826 - Kiwi', ratePerSession: 150000,
  course: 'TOPIK I', courseCategory: 'topik', days: 'T2', time: '19:30 - 21:30',
  startDate: '2026-08-03', endDate: '2026-09-30',
  teacherId: T1, teacher: 'Cô A', teacherAssignments: [], rateHistory: [],
  phases: [
    {
      courseTitle: 'TOPIK I', courseCategory: 'topik', days: 'T2', time: '19:30 - 21:30',
      fromDate: '2026-08-03', toDate: '2026-08-31',
      teachers: [{ teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-31', rate: 200000 }],
    },
    {
      courseTitle: 'GIAO TIẾP', courseCategory: 'conversation', days: 'T4', time: '18:00 - 20:00',
      fromDate: '2026-09-16', toDate: '2026-09-30',
      teachers: [{ teacherId: T2, teacherName: 'Cô B', fromDate: '2026-09-16', toDate: '2026-09-30', rate: 300000 }],
    },
  ],
  ...extra,
});

const ledger = (teacherId, classes, overrides = [], todayStr = TODAY) =>
  buildTeacherLedger({ teacherId, classes, overrides, bonuses: [], commissions: [], todayStr });

// Tổng tiền theo KỲ LƯƠNG — đây mới là con số giảng viên thực nhận.
const byPeriod = items => items.reduce((acc, i) => {
  const k = payPeriodLabel(i.date);
  acc[k] = (acc[k] || 0) + i.amount;
  return acc;
}, {});

// ═════════════════════════════════════════════════════════════════════════════════════
// 1. SỐ BUỔI DẠY — scheduledDatesOfClass gặp lớp nhiều khoá
// ═════════════════════════════════════════════════════════════════════════════════════

test('lớp hai khoá có quãng nghỉ: chỉ sinh buổi trong khoảng của từng khoá, quãng nghỉ trống trơn', () => {
  const dates = scheduledDatesOfClass(twoPhaseClass(), TODAY);
  assert.deepEqual(dates, [
    '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', // T2 khoá 1
    '2026-09-16', '2026-09-23', '2026-09-30',                             // T4 khoá 2
  ], 'đúng 5 buổi khoá 1 + 3 buổi khoá 2');
  // 02/09 và 09/09 là T4 nhưng nằm trong quãng nghỉ → không phải buổi của lớp.
  assert.ok(!dates.includes('2026-09-02'), '02/09 (T4) nằm trong quãng nghỉ, không sinh buổi');
  assert.ok(!dates.includes('2026-09-09'), '09/09 (T4) nằm trong quãng nghỉ, không sinh buổi');
  assert.equal(phaseAt(twoPhaseClass(), '2026-09-09'), null, 'ngày quãng nghỉ không thuộc khoá nào');
});

test('scheduledDatesOfClass và isScheduledDate luôn nói cùng một điều trên lớp nhiều khoá', () => {
  const cls = twoPhaseClass();
  const set = new Set(scheduledDatesOfClass(cls, TODAY));
  // Quét toàn bộ 03/08 → 30/09, không được lệch một ngày nào giữa hai cách kiểm.
  for (const d = new Date('2026-08-03'); d <= new Date('2026-09-30'); d.setDate(d.getDate() + 1)) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.equal(isScheduledDate(cls, s), set.has(s), `hai cách kiểm lịch lệch nhau ở ngày ${s}`);
  }
});

test('khoá còn mở: số buổi phụ thuộc ngày chốt truyền vào, không có ngày chốt thì ra rỗng', () => {
  const open = { _id: 'C9', phases: [{ courseTitle: 'A', days: 'T2', fromDate: '2026-09-01', toDate: null }] };
  assert.deepEqual(scheduledDatesOfClass(open, '2026-09-30'),
    ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'], 'chốt tới 30/09 → 4 buổi T2');
  assert.deepEqual(scheduledDatesOfClass(open, '2026-09-14'),
    ['2026-09-07', '2026-09-14'], 'chốt tới 14/09 → 2 buổi, bao gồm chính ngày chốt');
  assert.deepEqual(scheduledDatesOfClass(open, ''), [], 'không có ngày chốt thì khoá còn mở không sinh buổi nào');
  assert.deepEqual(scheduledDatesOfClass(open, '2026-08-15'), [], 'ngày chốt trước ngày khai giảng → rỗng');
  // Nhưng khoá ĐÃ đóng thì không cần ngày chốt.
  const closed = { _id: 'C9', phases: [{ courseTitle: 'A', days: 'T2', fromDate: '2026-09-01', toDate: '2026-09-14' }] };
  assert.deepEqual(scheduledDatesOfClass(closed, ''), ['2026-09-07', '2026-09-14'], 'khoá đã đóng không cần ngày chốt');
});

test('khoá chỉ dài đúng MỘT ngày: khớp thứ thì đúng 1 buổi, lệch thứ thì 0 buổi', () => {
  // 10/08/2026 là T2.
  const hit = { _id: 'C9', phases: [{ courseTitle: 'A', days: 'T2', fromDate: '2026-08-10', toDate: '2026-08-10' }] };
  assert.deepEqual(scheduledDatesOfClass(hit, TODAY), ['2026-08-10'], 'khoá 1 ngày đúng thứ → đúng 1 buổi');
  assert.equal(isScheduledDate(hit, '2026-08-10'), true, 'ngày đó là ngày học hợp lệ');

  const miss = { _id: 'C9', phases: [{ courseTitle: 'A', days: 'T4', fromDate: '2026-08-10', toDate: '2026-08-10' }] };
  assert.deepEqual(scheduledDatesOfClass(miss, TODAY), [], 'khoá 1 ngày lệch thứ → không buổi nào');
  assert.equal(isScheduledDate(miss, '2026-08-10'), false,
    'ngày nằm trong khoảng khoá nhưng sai thứ vẫn KHÔNG phải ngày học');
});

test('khoá mà không ngày nào trong khoảng khớp thứ học: 0 buổi nhưng vẫn qua được validate', () => {
  // 03/08 → 08/08/2026 chứa CN 02/08? Không — khoảng này chỉ có CN là 09/08, nằm ngoài.
  const phases = [{ courseTitle: 'A', days: 'CN', fromDate: '2026-08-03', toDate: '2026-08-08' }];
  assert.deepEqual(scheduledDatesOfClass({ _id: 'C9', phases }, TODAY), [],
    'khoảng 03→08/08 không chứa Chủ nhật nào');
  assert.doesNotThrow(() => validatePhases(phases),
    'dữ liệu hợp lệ về hình thức nên validatePhases không chặn — lớp lặng lẽ có 0 buổi');
  assert.deepEqual(ledger(T1, [{ _id: 'C9', name: 'L', ratePerSession: 200000, phases: [{ ...phases[0],
    teachers: [{ teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-08', rate: 200000 }] }] }]),
  [], 'không buổi nào → sổ lương rỗng, giảng viên không được đồng nào');
});

test('thứ tự phases trong mảng không ảnh hưởng: lịch luôn trả về đã sắp xếp và không trùng', () => {
  const cls = twoPhaseClass();
  const reversed = twoPhaseClass({ phases: [cls.phases[1], cls.phases[0]] });
  assert.deepEqual(scheduledDatesOfClass(reversed, TODAY), scheduledDatesOfClass(cls, TODAY),
    'đảo thứ tự khoá vẫn ra đúng cùng một lịch');
});

// ═════════════════════════════════════════════════════════════════════════════════════
// 2. LƯƠNG XUYÊN NHIỀU KHOÁ
// ═════════════════════════════════════════════════════════════════════════════════════

test('hai giảng viên hai khoá: mỗi người chỉ ăn lương của khoá mình, đúng từng kỳ lương', () => {
  const cls = twoPhaseClass();
  // Cô A: 03/08 (kỳ 2026-07) + 10, 17, 24, 31/08 (kỳ 2026-08), 200k/buổi.
  assert.deepEqual(byPeriod(ledger(T1, [cls])), { '2026-07': 200000, '2026-08': 800000 },
    'cô A: 1 buổi kỳ 7 + 4 buổi kỳ 8, đều 200k');
  // Cô B: 16, 23, 30/09 đều thuộc kỳ 2026-09, 300k/buổi.
  assert.deepEqual(byPeriod(ledger(T2, [cls])), { '2026-09': 900000 },
    'cô B: 3 buổi kỳ 9, đều 300k');
});

test('CÙNG một giảng viên dạy cả hai khoá với hai mức khác nhau: đơn giá đổi đúng tại biên khoá', () => {
  const cls = twoPhaseClass();
  cls.phases[1].teachers = [{ teacherId: T1, teacherName: 'Cô A', fromDate: '2026-09-16', toDate: '2026-09-30', rate: 300000 }];
  assert.equal(rateAt(cls, '2026-08-31', T1), 200000, 'ngày cuối khoá 1 vẫn là mức khoá 1');
  assert.equal(rateAt(cls, '2026-09-16', T1), 300000, 'ngày đầu khoá 2 đã là mức khoá 2');
  assert.equal(rateAt(cls, '2026-09-09', T1), 150000,
    'ngày trong quãng nghỉ không thuộc khoá nào → rơi về ratePerSession mặc định của lớp');
  assert.deepEqual(byPeriod(ledger(T1, [cls])),
    { '2026-07': 200000, '2026-08': 800000, '2026-09': 900000 },
    'tổng từng kỳ: 200k + 4×200k + 3×300k');
});

test('giảng viên chỉ dạy MỘT PHẦN của một khoá: buổi được chia đúng tại mốc bàn giao', () => {
  const cls = twoPhaseClass();
  // Cô A 03/08 → 16/08 (buổi 03, 10), cô C 17/08 → 31/08 (buổi 17, 24, 31) với mức khác.
  cls.phases[0].teachers = [
    { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-16', rate: 200000 },
    { teacherId: T3, teacherName: 'Cô C', fromDate: '2026-08-17', toDate: '2026-08-31', rate: 250000 },
  ];
  assert.deepEqual(ledger(T1, [cls]).map(i => i.date).sort(), ['2026-08-03', '2026-08-10'],
    'cô A chỉ có 2 buổi đầu khoá');
  assert.deepEqual(ledger(T3, [cls]).map(i => i.date).sort(), ['2026-08-17', '2026-08-24', '2026-08-31'],
    'cô C nhận 3 buổi cuối khoá');
  assert.deepEqual(byPeriod(ledger(T1, [cls])), { '2026-07': 200000, '2026-08': 200000 });
  assert.deepEqual(byPeriod(ledger(T3, [cls])), { '2026-08': 750000 }, 'cô C: 3 buổi × 250k');
  // effectiveAssignments trải phẳng cả 3 đoạn của 2 khoá, theo đúng thứ tự ngày.
  assert.deepEqual(effectiveAssignments(cls).map(a => [a.teacherId, a.fromDate]),
    [[T1, '2026-08-03'], [T3, '2026-08-17'], [T2, '2026-09-16']],
    'đoạn giảng viên của mọi khoá được trải phẳng theo ngày');
});

test('khoảng hở KHÔNG ai phụ trách bên trong một khoá: buổi rơi vào đó không tính cho ai', () => {
  const cls = twoPhaseClass();
  cls.phases[0].teachers = [
    { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-10', rate: 200000 },
    { teacherId: T3, teacherName: 'Cô C', fromDate: '2026-08-24', toDate: '2026-08-31', rate: 250000 },
  ];
  assert.doesNotThrow(() => validatePhases(cls.phases), 'khoảng hở giảng viên được phép tồn tại');
  assert.equal(teacherIdOnDate(cls, '2026-08-17'), null, '17/08 không ai phụ trách');
  const all = [...ledger(T1, [cls]), ...ledger(T3, [cls]), ...ledger(T2, [cls])];
  assert.ok(!all.some(i => i.date === '2026-08-17'),
    'buổi 17/08 vẫn nằm trong lịch lớp nhưng không vào sổ lương của ai — tiền "bốc hơi"');
  assert.equal(scheduledDatesOfClass(cls, TODAY).includes('2026-08-17'), true,
    'nhưng nó VẪN là một buổi của lớp (học sinh vẫn học)');
});

test('buổi chưa tới ngày hôm nay của khoá 2 không được tính, dù khoá 1 đã xong hết', () => {
  const cls = twoPhaseClass();
  assert.deepEqual(byPeriod(ledger(T2, [cls], [], '2026-09-23')), { '2026-09': 600000 },
    'hôm nay 23/09 → chỉ 2 buổi 16 và 23, chưa tính 30/09');
  assert.deepEqual(byPeriod(ledger(T1, [cls], [], '2026-09-23')), { '2026-07': 200000, '2026-08': 800000 },
    'khoá 1 đã kết thúc nên tiền của cô A không đổi theo ngày hôm nay');
});

// ═════════════════════════════════════════════════════════════════════════════════════
// 3. DOANH THU VÀ CHI PHÍ gặp "khoá học của lớp"
// ═════════════════════════════════════════════════════════════════════════════════════

const paidPkg = (id, netTotal, enrollments, paidAt) => ({
  pkg: { _id: id, netTotal, paidAdjustment: 0, enrollments },
  payment: { packageId: id, amount: netTotal, paidAt },
});

// NGHI VẤN: đổi khoá học của lớp làm ĐỔI NGƯỢC cơ cấu doanh thu của những tháng ĐÃ CHỐT.
// classController.updatePhases ghi lại courseCategory cho mọi ghi danh còn học, mà báo cáo
// doanh thu lại đọc chính trường đó của ghi danh — nên biểu đồ tháng 8 (đã đóng sổ) đổi
// nhóm sau khi admin sửa khoá vào tháng 9. Ghi danh đã nghỉ thì giữ nguyên, tức là cùng
// một tháng có hai chuẩn phân loại song song.
test('NGHI VẤN — đổi khoá học của lớp làm cơ cấu doanh thu THÁNG CŨ đổi nhóm, chỉ với ghi danh còn học', () => {
  const active = paidPkg('p1', 3000000,
    [{ startDate: '2026-08-03', courseCategory: 'topik', netPrice: 3000000, status: 'active' }], '2026-08-05T02:00:00Z');
  const dropped = paidPkg('p2', 3000000,
    [{ startDate: '2026-08-03', courseCategory: 'topik', netPrice: 3000000, status: 'dropped' }], '2026-08-05T02:00:00Z');
  const packages = [active.pkg, dropped.pkg];
  const payments = [active.payment, dropped.payment];

  const before = aggregateByMonth(packages, packageFacts(packages, payments), {})['2026-08'];
  assert.equal(before.breakdown.topik, 6000000, 'trước khi sửa: cả 6 triệu nằm ở nhóm TOPIK');

  // Admin đổi khoá của lớp sang GIAO TIẾP: classFieldsFromPhases quyết định course mới,
  // controller đồng bộ courseCategory cho ghi danh CÒN HỌC (active/unassigned/reserved).
  const nextPhases = [{ ...twoPhaseClass().phases[0], courseTitle: 'GIAO TIẾP', courseCategory: 'conversation' }];
  const fields = classFieldsFromPhases(nextPhases, '2026-09-17');
  assert.equal(categoryOf(fields.course), 'conversation', 'khoá mới thuộc nhóm giao tiếp');
  for (const p of packages) {
    for (const e of p.enrollments) {
      if (['active', 'unassigned', 'reserved'].includes(e.status)) e.courseCategory = categoryOf(fields.course);
    }
  }

  const after = aggregateByMonth(packages, packageFacts(packages, payments), {})['2026-08'];
  assert.equal(after.revenue, before.revenue, 'tổng doanh thu tháng 8 không đổi');
  assert.equal(after.breakdown.topik, 3000000, 'ghi danh đã nghỉ giữ nguyên nhóm TOPIK');
  assert.equal(after.breakdown.conversation, 3000000,
    'ghi danh còn học nhảy sang nhóm giao tiếp — biểu đồ tháng 8 đổi dù tháng đó đã đóng sổ');
});

test('cơ cấu doanh thu theo khoá luôn khít với tổng doanh thu khi gói được định giá bằng priceItems', () => {
  // Gói 2 khoá: TOPIK I 4tr + GIAO TIẾP 3tr, giảm 1tr chia tự động theo giá niêm yết.
  const priced = priceItems({ discount: 1000000, discountAllocation: 'auto',
    items: [{ listPrice: 4000000 }, { listPrice: 3000000 }] });
  const enrollments = [
    { startDate: '2026-09-02', courseCategory: 'topik', netPrice: priced.items[0].netPrice },
    { startDate: '2026-09-02', courseCategory: 'conversation', netPrice: priced.items[1].netPrice },
  ];
  const packages = [{ _id: 'p1', netTotal: priced.netTotal, paidAdjustment: 0, enrollments }];
  const payments = [{ packageId: 'p1', amount: priced.netTotal, paidAt: '2026-09-05T02:00:00Z' }];
  const m = aggregateByMonth(packages, packageFacts(packages, payments), {})['2026-09'];
  const sum = Object.values(m.breakdown).reduce((a, b) => a + b, 0);
  assert.equal(priced.netTotal, 6000000, 'tổng phải thu sau giảm');
  assert.equal(sum, m.revenue, 'tổng cơ cấu theo khoá phải bằng doanh thu tháng, không lệch đồng nào');
  assert.equal(m.breakdown.topik, 3428571, 'khoá TOPIK gánh 571.429đ tiền giảm (phần dư lớn nhất)');
  assert.equal(m.breakdown.conversation, 2571429, 'khoá giao tiếp gánh 428.571đ');
});

test('ghi danh không có loại khoá (hoặc loại lạ) được gom vào nhóm giao tiếp', () => {
  const mk = cat => {
    const e = { startDate: '2026-09-02', netPrice: 1000000 };
    if (cat !== undefined) e.courseCategory = cat;
    const packages = [{ _id: 'p1', netTotal: 1000000, paidAdjustment: 0, enrollments: [e] }];
    const payments = [{ packageId: 'p1', amount: 1000000, paidAt: '2026-09-05T02:00:00Z' }];
    return aggregateByMonth(packages, packageFacts(packages, payments), {})['2026-09'].breakdown;
  };
  assert.equal(mk(undefined).conversation, 1000000, 'thiếu loại → giao tiếp');
  assert.equal(mk('advanced').conversation, 1000000, 'loại không nằm trong 5 nhóm → giao tiếp');
});

// ĐÃ VÁ (2026-09-17): `e.courseCategory in m.breakdown` đi cả chuỗi prototype, nên tên loại
// trùng thuộc tính của Object ('constructor', 'toString'…) lọt qua bộ lọc và làm hỏng ô đó
// — số bị NỐI CHUỖI vào một function thay vì cộng. Enum của Enrollment đang chặn nên chưa
// xảy ra trên dữ liệu thật, nhưng Class.courseCategory / phases[].courseCategory là tự do.
test('loại khoá trùng tên thuộc tính của Object vẫn rơi đúng về giao tiếp', () => {
  const packages = [{ _id: 'p1', netTotal: 1000, paidAdjustment: 0,
    enrollments: [{ startDate: '2026-09-02', courseCategory: 'constructor', netPrice: 1000 }] }];
  const payments = [{ packageId: 'p1', amount: 1000, paidAt: '2026-09-05T02:00:00Z' }];
  const b = aggregateByMonth(packages, packageFacts(packages, payments), {})['2026-09'].breakdown;
  assert.equal(b.conversation, 1000, 'rơi về nhóm mặc định như mọi loại lạ khác');
  assert.equal(typeof b.constructor, 'function', 'không sinh ô rác nào');
});

test('chi phí lương của lớp nhiều khoá: kỳ lương xếp vào tháng của NGÀY CHI, không phải tháng của kỳ', () => {
  const cls = twoPhaseClass();
  const aug = byPeriod(ledger(T1, [cls]))['2026-08'];
  assert.equal(aug, 800000, 'kỳ lương 2026-08 của cô A (10/08 → 09/09) là 800k');
  // Admin trả kỳ 2026-08 vào ngày 10/09/2026 → khoản chi thuộc THÁNG 9.
  const { byMonth } = bucketExpenses([
    { category: 'salary', amount: aug, paidAt: '2026-09-10T02:00:00Z', month: '2026-08' },
    { category: 'salary', amount: byPeriod(ledger(T2, [cls]))['2026-09'], paidAt: '2026-10-10T02:00:00Z', month: '2026-09' },
  ]);
  assert.equal(byMonth['2026-09'].salary, 800000, 'lương kỳ 8 rơi vào chi phí tháng 9');
  assert.equal(byMonth['2026-10'].salary, 900000, 'lương kỳ 9 của cô B rơi vào chi phí tháng 10');
  assert.equal(byMonth['2026-08'], undefined,
    'tháng 8 không có khoản chi nào dù toàn bộ buổi dạy khoá 1 diễn ra trong tháng 8');
  assert.equal(monthOfPaidAt('2026-09-10'), '2026-09', 'nhãn tháng luôn suy từ ngày chi');
});

test('hai khoá của cùng lớp rơi vào hai tháng chi khác nhau vẫn được lọc đúng theo khoảng ngày', () => {
  const expenses = [
    { category: 'salary', amount: 800000, paidAt: '2026-09-10T02:00:00Z' },
    { category: 'salary', amount: 900000, paidAt: '2026-10-10T02:00:00Z' },
    { category: 'rent', amount: 5000000, paidAt: '2026-09-01T02:00:00Z' },
  ];
  const sep = bucketExpenses(expenses, { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(sep.total, 5800000, 'chỉ gom khoản chi trong tháng 9');
  assert.deepEqual(Object.keys(sep.byMonth), ['2026-09'], 'không kéo theo khoản chi tháng 10');
});

// ═════════════════════════════════════════════════════════════════════════════════════
// 4. BẤT BIẾN LỚN NHẤT: phaseDiff + classDate — áp resolutions xong KHÔNG còn mồ côi
// ═════════════════════════════════════════════════════════════════════════════════════

// Mô phỏng đúng những gì classController.updatePhases làm trong transaction:
//   delete → xoá bản ghi;  move → đổi date (điểm danh còn bị xoá replacesDate).
function applyResolutions(orphans, resolutions, records) {
  const removed = new Set();
  for (const o of orphans) {
    const r = resolutions[o.id];
    assert.ok(r, `bản ghi ${o.id} chưa được định đoạt — controller sẽ chặn không cho lưu`);
    if (r.action === 'delete') { removed.add(o.id); continue; }
    const rec = records.find(x => String(x._id) === o.id);
    rec.date = r.toDate;
    if (o.kind === 'attendance') rec.replacesDate = null;
  }
  return records.filter(x => !removed.has(String(x._id)));
}

const orphanScenario = () => {
  const cls = twoPhaseClass();
  // Admin đổi khoá 1 từ T2 sang T4: mất 03, 10, 17, 24, 31/08 — thêm 05, 12, 19, 26/08.
  const nextPhases = [{ ...cls.phases[0], days: 'T4' }, cls.phases[1]];
  const sessions = [
    { _id: 'S1', classId: 'C1', date: '2026-08-03', status: 'taught' },
    { _id: 'S2', classId: 'C1', date: '2026-08-10', status: 'absent' },
    { _id: 'S3', classId: 'C1', date: '2026-08-17', status: 'taught' },
    { _id: 'S4', classId: 'C1', date: '2026-09-16', status: 'taught' }, // khoá 2, không đụng tới
  ];
  const attendances = [
    { _id: 'A1', classId: 'C1', date: '2026-08-24' },
    { _id: 'A2', classId: 'C1', date: '2026-08-20', replacesDate: '2026-08-17' }, // buổi bù cho ngày sắp mất
    { _id: 'A3', classId: 'C1', date: '2026-09-23' },                             // khoá 2, không đụng tới
  ];
  return { cls, nextPhases, sessions, attendances };
};

test('BẤT BIẾN: áp hết resolutions của diffPhases xong, không còn bản ghi nào mồ côi', () => {
  const { cls, nextPhases, sessions, attendances } = orphanScenario();
  const d = diffPhases({ cls, nextPhases, sessions, attendances, payments: [], today: TODAY });
  assert.deepEqual(d.orphans.map(o => o.id), ['S1', 'S2', 'S3', 'A1', 'A2'],
    'đúng 5 bản ghi rơi ra ngoài lịch mới; S4/A3 thuộc khoá 2 nên an toàn');
  assert.deepEqual(d.gainedDates, ['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26'],
    'chỉ có 4 ngày trống để chuyển tới');

  // Admin định đoạt: 4 bản ghi chuyển sang 4 ngày trống, bản ghi thứ 5 đành xoá.
  const resolutions = {
    S1: { action: 'move', toDate: '2026-08-05' },
    S2: { action: 'move', toDate: '2026-08-12' },
    S3: { action: 'move', toDate: '2026-08-19' },
    A1: { action: 'move', toDate: '2026-08-26' },
    A2: { action: 'delete' },
  };
  const after = { ...cls, phases: nextPhases };
  const keptSessions = applyResolutions(d.orphans.filter(o => o.kind === 'session'), resolutions, [...sessions]);
  const keptAttendances = applyResolutions(d.orphans.filter(o => o.kind === 'attendance'), resolutions, [...attendances]);

  for (const s of keptSessions) {
    assert.equal(isValidClassDate(after, s, 'session'), true,
      `buổi dạy ${s._id} ngày ${s.date} vẫn mồ côi sau khi áp resolutions`);
  }
  for (const a of keptAttendances) {
    assert.equal(isValidClassDate(after, a, 'attendance'), true,
      `điểm danh ${a._id} ngày ${a.date} vẫn mồ côi sau khi áp resolutions`);
  }
  // Chạy lại diff trên trạng thái đã định đoạt: không còn gì phải xử lý nữa.
  const again = diffPhases({ cls: after, nextPhases, sessions: keptSessions, attendances: keptAttendances,
    payments: [], today: TODAY });
  assert.deepEqual(again.orphans, [], 'chạy lại diff trên dữ liệu đã dọn: không còn bản ghi mồ côi');
  assert.deepEqual(again.lostDates, [], 'lịch không đổi nữa nên không mất ngày nào');
});

test('BẤT BIẾN vỡ nếu bỏ sót MỘT bản ghi — chứng minh bài test trên có ý nghĩa', () => {
  const { cls, nextPhases, sessions, attendances } = orphanScenario();
  const after = { ...cls, phases: nextPhases };
  // Không định đoạt gì cả: cả 5 bản ghi đều nằm ngoài lịch mới.
  const stillBad = [...sessions, ...attendances]
    .filter(r => !isValidClassDate(after, r, r._id.startsWith('S') ? 'session' : 'attendance'));
  assert.deepEqual(stillBad.map(r => r._id), ['S1', 'S2', 'S3', 'A1', 'A2'],
    'để nguyên thì đúng 5 bản ghi thành mồ côi — đây chính là thứ resolutions phải dọn');
});

test('chuyển bản ghi sang một ngày KHÔNG nằm trong gợi ý vẫn có thể sinh ra mồ côi mới', () => {
  const { cls, nextPhases, sessions } = orphanScenario();
  const after = { ...cls, phases: nextPhases };
  // 20/08 là T5 — không thuộc lịch mới. diffPhases không bao giờ gợi ý nó, nhưng cũng
  // không có gì trong util chặn client gửi lên một toDate tuỳ ý.
  const moved = { ...sessions[0], date: '2026-08-20' };
  assert.equal(isValidClassDate(after, moved, 'session'), false,
    'ngày ngoài danh sách gợi ý không được bảo đảm hợp lệ');
  const suggestions = diffPhases({ cls, nextPhases, sessions, attendances: [], payments: [], today: TODAY })
    .orphans[0].suggestions;
  assert.ok(!suggestions.includes('2026-08-20'), 'diffPhases đúng là không gợi ý ngày đó');
  for (const d of suggestions) {
    assert.equal(isValidClassDate(after, { date: d }, 'session'), true,
      `mọi ngày được gợi ý phải hợp lệ trong lịch mới (${d})`);
  }
});

// `suggestions` của mỗi bản ghi là TOÀN BỘ chỗ trống, xếp theo khoảng cách tới ngày gốc —
// util không biết admin sẽ chọn gì nên không trừ dần được. Việc trừ dần do hộp xác nhận lo
// (dùng `freeDates`), và updatePhases kiểm lại lần cuối: hai bản ghi chọn trùng ngày bị
// chặn ngay tại API chứ không để đâm vào unique index giữa transaction.
test('suggestions là toàn bộ chỗ trống xếp theo khoảng cách; freeDates để UI trừ dần', () => {
  const { cls, nextPhases, sessions, attendances } = orphanScenario();
  const d = diffPhases({ cls, nextPhases, sessions, attendances, payments: [], today: TODAY });
  assert.equal(d.orphans.length, 5, '5 bản ghi phải dọn');
  assert.ok(Array.isArray(d.freeDates) && d.freeDates.length > 0, 'diff phải trả freeDates cho UI');
  for (const o of d.orphans) {
    assert.deepEqual([...o.suggestions].sort(), [...d.freeDates].sort(),
      `bản ghi ${o.id} được gợi ý toàn bộ chỗ trống`);
  }
  assert.equal(d.orphans.find(o => o.id === 'S3').suggestions[0], '2026-08-19',
    'ngày gần ngày gốc nhất đứng đầu');
});

// ĐÃ VÁ (2026-09-17): chênh lệch kỳ lương phải đọc TRẠNG THÁI bản ghi, không tính thuần từ
// lịch. Buổi 10/08 là 'absent' — không ai được trả tiền — nên không được tính vào cột
// "trước", nếu không bảng sẽ báo hụt 200k trong khi sổ lương thật không đổi đồng nào.
test('chênh lệch kỳ lương đọc trạng thái buổi: absent không tính tiền', () => {
  const { cls, nextPhases, sessions, attendances } = orphanScenario();
  const d = diffPhases({ cls, nextPhases, sessions, attendances, payments: [], today: TODAY });
  const aug = d.periods.find(p => p.label === '2026-08');
  assert.equal(aug, undefined, 'kỳ 2026-08 không đổi đồng nào nên không phải cảnh báo');
  assert.equal(byPeriod(ledger(T1, [cls], sessions))['2026-08'], 600000,
    'khớp với sổ lương thật: 3 buổi × 200k trước và sau đều vậy');
});

// ĐÃ VÁ (2026-09-17): buổi 'absent'/'not-taught' vốn 0 đồng — hiện đơn giá ở màn hình xác
// nhận làm admin tưởng xoá nó là mất 200k.
test('bản ghi mồ côi trạng thái absent hiện số tiền bằng 0', () => {
  const { cls, nextPhases, sessions, attendances } = orphanScenario();
  const d = diffPhases({ cls, nextPhases, sessions, attendances, payments: [], today: TODAY });
  const s2 = d.orphans.find(o => o.id === 'S2');
  assert.equal(s2.status, 'absent', 'buổi này đã ghi nhận là không có ai học');
  assert.equal(s2.amount, 0, 'không sinh tiền thì không hiện tiền');
  assert.equal(s2.period, '', 'và không thuộc kỳ lương nào');
});

test('diffPhases cũng tóm được bản ghi VỐN ĐÃ mồ côi từ trước, không chỉ ngày mới mất', () => {
  const cls = twoPhaseClass();
  // 05/08 là T4 — chưa bao giờ nằm trong lịch T2 của khoá 1. Bản ghi này đã sai từ trước.
  const sessions = [{ _id: 'S9', classId: 'C1', date: '2026-08-05', status: 'taught' }];
  // Sửa giờ học thôi, không đụng tới thứ.
  const nextPhases = [{ ...cls.phases[0], time: '20:00 - 22:00' }, cls.phases[1]];
  const d = diffPhases({ cls, nextPhases, sessions, attendances: [], payments: [], today: TODAY });
  assert.deepEqual(d.lostDates, [], 'không mất ngày nào');
  assert.deepEqual(d.orphans.map(o => o.id), ['S9'],
    'nhưng bản ghi mồ côi sẵn có vẫn bị bắt dọn — mọi lần lưu khoá đều là một lần quét lại');
  assert.ok(d.orphans[0].suggestions.length > 0,
    'vẫn gợi ý được: chỗ trống là mọi ngày trong lịch mới chưa có bản ghi, không chỉ ngày mới thêm');
});

// NGHI VẤN: nếu nextPhases là mảng RỖNG, `after` không phải "lớp không còn buổi nào" —
// effectivePhases rơi về nhánh suy-từ-lớp và DỰNG RA một khoá ảo từ cls.days/startDate/
// endDate (T2, 03/08 → 30/09), tức là một lịch chưa bao giờ tồn tại. Diff báo "thêm" các
// ngày T2 của tháng 9 và chỉ "mất" các ngày T4 của khoá 2. Controller chặn danh sách rỗng
// trước khi gọi, nên chưa lộ ra API — nhưng util đứng một mình thì im lặng trả kết quả sai.
test('NGHI VẤN — diffPhases với danh sách khoá rỗng dựng ra một lịch ảo từ field cũ của lớp', () => {
  const cls = twoPhaseClass();
  const sessions = [{ _id: 'S1', classId: 'C1', date: '2026-08-03', status: 'taught' }];
  const d = diffPhases({ cls, nextPhases: [], sessions, attendances: [], payments: [], today: TODAY });
  assert.deepEqual(d.lostDates, ['2026-09-16', '2026-09-23', '2026-09-30'],
    'chỉ khoá 2 bị coi là mất; các ngày T2 tháng 8 vẫn "còn" nhờ cls.days = T2');
  assert.deepEqual(d.gainedDates, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'],
    'và còn THÊM ra 4 ngày T2 tháng 9 mà lớp chưa bao giờ có');
  assert.deepEqual(d.orphans, [], 'không bản ghi nào bị coi là mồ côi dù lớp vừa bị xoá sạch khoá');
});

// ═════════════════════════════════════════════════════════════════════════════════════
// 5. classFieldsFromPhases ở các mốc biên
// ═════════════════════════════════════════════════════════════════════════════════════

test('classFieldsFromPhases: hôm nay đúng NGÀY ĐẦU và NGÀY CUỐI của khoá đều thuộc khoá đó', () => {
  const phases = twoPhaseClass().phases;
  const first = classFieldsFromPhases(phases, '2026-08-03'); // ngày đầu khoá 1, T2
  assert.equal(first.course, 'TOPIK I', 'ngày khai giảng đã tính là đang chạy khoá 1');
  assert.equal(first.days, 'T2');
  assert.equal(first.teacherId, T1, 'đoạn giảng viên cũng tính từ ngày đầu');

  const last = classFieldsFromPhases(phases, '2026-08-31'); // ngày cuối khoá 1, T2
  assert.equal(last.course, 'TOPIK I', 'ngày kết thúc VẪN thuộc khoá 1 (biên đóng hai đầu)');
  assert.equal(last.teacherId, T1);

  const p2First = classFieldsFromPhases(phases, '2026-09-16');
  assert.equal(p2First.course, 'GIAO TIẾP', 'ngày đầu khoá 2');
  assert.equal(p2First.teacherId, T2);
  assert.equal(p2First.time, '18:00 - 20:00', 'giờ học đổi theo khoá đang chạy');
  assert.equal(p2First.startDate, '2026-08-03', 'ngày khai giảng của LỚP là ngày đầu khoá sớm nhất');
  assert.equal(p2First.endDate, '2026-09-30', 'ngày kết thúc của LỚP là ngày cuối khoá muộn nhất');
});

// ĐÃ VÁ (2026-09-17): trước đây lớp CHƯA khai giảng hiện khoá CUỐI CÙNG, nên danh sách lớp
// và lịch công khai quảng cáo sai khoá và sai thứ học. Khoá "gần nhất" hợp lý cho lớp đã
// đóng; lớp chưa mở thì phải là khoá SẮP tới.
test('lớp chưa khai giảng hiển thị khoá SẮP học, không phải khoá cuối', () => {
  const f = classFieldsFromPhases(twoPhaseClass().phases, '2026-07-01');
  assert.equal(f.course, 'TOPIK I', 'khoá sắp khai giảng');
  assert.equal(f.days, 'T2', 'và thứ học của chính khoá đó');
  assert.equal(f.teacher, 'Cô A', 'giảng viên sẽ dạy khoá đó');
  assert.equal(f.startDate, '2026-08-03', 'ngày khai giảng vẫn đúng');
});

// ĐÃ VÁ (2026-09-17): lớp đã đóng phải GIỮ giảng viên cuối cùng. Xoá trắng teacher/teacherId
// không chỉ hỏng hiển thị — teacherPortal lọc lớp theo Class.teacherId, nên giảng viên sẽ
// mất quyền vào chính lớp mình vừa dạy xong.
test('classFieldsFromPhases: mọi khoá đã đóng thì giữ khoá cuối VÀ giảng viên cuối', () => {
  const f = classFieldsFromPhases(twoPhaseClass().phases, '2026-10-01');
  assert.equal(f.course, 'GIAO TIẾP', 'lớp đã đóng vẫn hiển thị khoá cuối cùng');
  assert.equal(f.endDate, '2026-09-30');
  assert.equal(f.teacher, 'Cô B', 'giữ giảng viên cuối, không xoá trắng');
  assert.equal(f.teacherId, T2);
  // Nhưng lịch sử lương thì không mất: sổ lương vẫn tra được người dạy từng ngày.
  assert.equal(teacherIdOnDate(twoPhaseClass(), '2026-09-30'), T2,
    'field trên lớp chỉ là ảnh chụp hôm nay, không phải nguồn tính lương');
});

test('classFieldsFromPhases: biên đoạn giảng viên bên trong một khoá', () => {
  const phases = [{
    courseTitle: 'TOPIK I', courseCategory: 'topik', days: 'T2', time: '19:30 - 21:30',
    fromDate: '2026-08-03', toDate: '2026-08-31',
    teachers: [
      { teacherId: T1, teacherName: 'Cô A', fromDate: '2026-08-03', toDate: '2026-08-16', rate: 200000 },
      { teacherId: T3, teacherName: 'Cô C', fromDate: '2026-08-17', toDate: '2026-08-31', rate: 250000 },
    ],
  }];
  assert.equal(classFieldsFromPhases(phases, '2026-08-16').teacherId, T1, 'ngày cuối của cô A vẫn là cô A');
  assert.equal(classFieldsFromPhases(phases, '2026-08-17').teacherId, T3, 'ngày bàn giao đã thuộc cô C');
  assert.equal(classFieldsFromPhases(phases, '2026-08-17').teacher, 'Cô C');
});

test('classFieldsFromPhases: khoá cuối còn mở thì lớp không có ngày kết thúc', () => {
  const phases = [
    { courseTitle: 'A', courseCategory: 'topik', days: 'T2', time: '', fromDate: '2026-08-03', toDate: '2026-08-31', teachers: [] },
    { courseTitle: 'B', courseCategory: null, days: 'T4', time: '', fromDate: '2026-09-16', toDate: null, teachers: [] },
  ];
  const f = classFieldsFromPhases(phases, '2026-09-20');
  assert.equal(f.endDate, '', 'khoá cuối chưa đóng → lớp chưa có ngày kết thúc');
  assert.equal(f.courseCategory, null, 'khoá không gắn nhóm thì field trên lớp cũng null');
});

// ═════════════════════════════════════════════════════════════════════════════════════
// 6. BUỔI DỜI LỊCH cắt ngang hai khoá
// ═════════════════════════════════════════════════════════════════════════════════════

// Buổi gốc 17/08 (T2, khoá 1, cô A, 200k) được dạy bù vào 16/09 (T4, nằm trong khoá 2).
const rescheduled = {
  _id: 'S-R', classId: 'C1', className: 'VIP0826 - Kiwi',
  date: '2026-08-17', status: 'rescheduled', rescheduledDate: '2026-09-16', payDate: '2026-09-16',
};

test('buổi dời lịch sang khoảng của khoá 2: khoá và đơn giá theo NGÀY GỐC, kỳ lương theo NGÀY BÙ', () => {
  const cls = twoPhaseClass();
  const r = resolveSession(cls, rescheduled, teacherIdOnDate(cls, rescheduled.date));
  assert.equal(r.phase.courseTitle, 'TOPIK I', 'buổi vẫn thuộc khoá của NGÀY GỐC, không phải khoá của ngày bù');
  assert.equal(r.rate, 200000, 'đơn giá tra tại ngày gốc — không ăn theo mức 300k của khoá 2');
  assert.equal(r.teacherId, T1, 'người được tính là người phụ trách NGÀY GỐC');
  assert.equal(r.payDate, '2026-09-16', 'nhưng kỳ lương đi theo ngày dạy thật');
  assert.equal(payPeriodLabel(r.payDate), '2026-09', 'rơi vào kỳ lương tháng 9');
  assert.equal(payPeriodLabel(rescheduled.date), '2026-08', 'trong khi ngày gốc thuộc kỳ tháng 8');
});

test('sổ lương của buổi dời lịch: tiền rời khỏi kỳ 2026-08 sang kỳ 2026-09 đúng bằng mức khoá 1', () => {
  const cls = twoPhaseClass();
  assert.deepEqual(byPeriod(ledger(T1, [cls], [rescheduled])),
    { '2026-07': 200000, '2026-08': 600000, '2026-09': 200000 },
    'kỳ 8 còn 3 buổi, buổi thứ 4 nhảy sang kỳ 9 nhưng vẫn là 200k của khoá 1');
  assert.deepEqual(byPeriod(ledger(T2, [cls], [rescheduled])), { '2026-09': 900000 },
    'cô B không bị ảnh hưởng, vẫn đủ 3 buổi khoá 2');
  // Bản ghi vẫn nằm ở ngày gốc nên không đụng unique index (classId, date) của 16/09.
  assert.equal(isValidClassDate(cls, rescheduled, 'session'), true,
    'buổi dời lịch lưu ở ngày gốc nên luôn hợp lệ theo lịch lớp');
});

// NGHI VẤN: trong kỳ 2026-09 lớp này sinh ra HAI buổi được trả tiền cùng ngày 16/09 —
// buổi thật của khoá 2 (cô B, 300k) và buổi bù của khoá 1 (cô A, 200k). Không có gì
// trong util kiểm rằng ngày bù đã bận: chi phí lớp ngày hôm đó là 500k.
test('NGHI VẤN — ngày bù trùng đúng ngày lớp đã có buổi của khoá 2: trả tiền cho cả hai', () => {
  const cls = twoPhaseClass();
  const onDay = [...ledger(T1, [cls], [rescheduled]), ...ledger(T2, [cls], [rescheduled])]
    .filter(i => i.date === '2026-09-16');
  assert.deepEqual(onDay.map(i => i.amount).sort((a, b) => a - b), [200000, 300000],
    'cùng một ngày, cùng một lớp, hai giảng viên đều được trả');
});

// ĐÃ VÁ (2026-09-17): đơn giá của buổi được gán tay sang người khác phải KẾ THỪA BUỔI GỐC.
// Trước đây tra theo người nhận — mà họ không có đoạn nào trong khoá gốc — nên rơi thẳng
// xuống ratePerSession mặc định của lớp: không phải 200k (khoá gốc), cũng không phải 300k.
test('dời lịch + đổi người sang giảng viên khoá 2: đơn giá kế thừa BUỔI GỐC', () => {
  const cls = twoPhaseClass(); // ratePerSession = 150000
  const s = { ...rescheduled, paidTeacherId: T2, paidTeacherName: 'Cô B' };
  const r = resolveSession(cls, s, teacherIdOnDate(cls, s.date));
  assert.equal(r.teacherId, T2, 'buổi đã được chốt cho cô B');
  assert.equal(r.phase.courseTitle, 'TOPIK I', 'khoá vẫn là khoá của ngày gốc');
  assert.equal(r.rate, 200000, 'đơn giá của khoá gốc, không phải mức mặc định của lớp');
  assert.deepEqual(byPeriod(ledger(T1, [cls], [s])), { '2026-07': 200000, '2026-08': 600000 },
    'cô A mất buổi đó');
  assert.deepEqual(byPeriod(ledger(T2, [cls], [s])), { '2026-09': 1100000 },
    'cô B được cộng đúng 200k của buổi gốc');
});

// ĐÃ VÁ (2026-09-17): lớp dựng thuần theo mô hình mới (lương nằm hết trong
// phases[].teachers[].rate, không có ratePerSession) trước đây làm buổi BỐC HƠI khỏi sổ
// lương của cả hai người — rateAt trả null nên buildTeacherLedger bỏ hẳn dòng đó.
test('lớp không có ratePerSession: buổi dời lịch đổi người vẫn được trả đúng đơn giá gốc', () => {
  const cls = twoPhaseClass();
  delete cls.ratePerSession;
  const s = { ...rescheduled, paidTeacherId: T2, paidTeacherName: 'Cô B' };
  assert.equal(rateAt(cls, '2026-08-17', T2), null, 'tra trực tiếp cho cô B vẫn không ra gì');
  assert.equal(resolveSession(cls, s, teacherIdOnDate(cls, s.date)).rate, 200000,
    'nhưng resolveSession kế thừa đơn giá của người vốn phụ trách ngày đó');
  assert.deepEqual(byPeriod(ledger(T1, [cls], [s])), { '2026-07': 200000, '2026-08': 600000 },
    'cô A không còn buổi 17/08');
  assert.deepEqual(byPeriod(ledger(T2, [cls], [s])), { '2026-09': 1100000 },
    'cô B được cộng đúng 200k — không còn buổi nào bốc hơi');
});

// NGHI VẤN: ngày bù rơi vào QUÃNG NGHỈ giữa hai khoá (05/09 — lớp không có khoá nào đang
// chạy). Tiền vẫn được ghi nhận vào kỳ lương của ngày đó, cho một ngày mà lớp không tồn tại.
test('NGHI VẤN — ngày bù rơi vào quãng nghỉ giữa hai khoá vẫn được trả tiền bình thường', () => {
  const cls = twoPhaseClass();
  // 10/09/2026 là T5, nằm gọn trong quãng nghỉ 01/09 → 15/09 và thuộc kỳ lương 2026-09.
  const s = { ...rescheduled, date: '2026-08-24', rescheduledDate: '2026-09-10', payDate: '2026-09-10' };
  assert.equal(phaseAt(cls, '2026-09-10'), null, '10/09 không thuộc khoá nào của lớp');
  assert.equal(isScheduledDate(cls, '2026-09-10'), false, 'cũng không phải ngày học');
  assert.deepEqual(byPeriod(ledger(T1, [cls], [s])),
    { '2026-07': 200000, '2026-08': 600000, '2026-09': 200000 },
    'vẫn có 200k rơi vào kỳ 2026-09 cho một ngày lớp đang nghỉ giữa hai khoá');
});

// ĐÃ VÁ (2026-09-17): `orphans[].period` và bảng `periods` phải nói CÙNG một chuyện. Cả hai
// nay đều theo `payDate` — tiền rơi vào kỳ nào thì báo kỳ đó.
test('đổi lịch khoá 1 khiến buổi dời lịch thành mồ côi: orphan và bảng kỳ lương khớp nhau', () => {
  const cls = twoPhaseClass();
  const nextPhases = [{ ...cls.phases[0], days: 'T4' }, cls.phases[1]];
  const d = diffPhases({ cls, nextPhases, sessions: [rescheduled], attendances: [], payments: [], today: TODAY });
  const o = d.orphans.find(x => x.id === 'S-R');
  assert.ok(o, 'buổi dời lịch lưu ở ngày gốc 17/08 nên mất theo lịch T2');
  assert.equal(o.date, '2026-08-17', 'hiển thị theo ngày gốc');
  assert.equal(o.amount, 200000, 'số tiền theo đơn giá ngày gốc');
  assert.equal(o.period, '2026-09', 'kỳ lương bị ảnh hưởng là kỳ của NGÀY BÙ');
  const sep = d.periods.find(p => p.label === '2026-09');
  assert.ok(sep && sep.diff !== 0, 'và bảng chênh lệch cũng phải đụng đúng kỳ 2026-09');
});
