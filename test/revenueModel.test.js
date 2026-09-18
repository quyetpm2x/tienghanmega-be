const test = require('node:test');
const assert = require('node:assert/strict');
const { vnDateStr, packageFacts, aggregateByMonth } = require('../src/utils/revenueModel');

const pkg = (id, netTotal, enrollments, paidAdjustment = 0) => ({ _id: id, netTotal, paidAdjustment, enrollments });

test('cắt ngày theo giờ Việt Nam', () => {
  assert.equal(vnDateStr('2026-09-30T17:30:00.000Z'), '2026-10-01');
  assert.equal(vnDateStr('2026-09-30T16:59:59.000Z'), '2026-09-30');
});

test('tháng chốt = khoản đóng sớm nhất của gói; đóng nốt tháng sau không dời tháng', () => {
  const packages = [pkg('p1', 2690000, [{ startDate: '2026-10-20', courseCategory: 'conversation', netPrice: 2690000 }])];
  const payments = [
    { packageId: 'p1', amount: 2190000, paidAt: '2026-11-05T03:00:00Z' },
    { packageId: 'p1', amount: 500000, paidAt: '2026-10-10T03:00:00Z' },
  ];
  const f = packageFacts(packages, payments).get('p1');
  assert.deepEqual(f.close, { date: '2026-10-10', month: '2026-10', estimated: false });
  assert.equal(f.paid, 2690000);
  assert.equal(f.tuitionStatus, 'paid');
});

test('không có khoản thu nhưng có điều chỉnh dương → ước lượng theo ngày khai giảng sớm nhất', () => {
  const packages = [pkg('p2', 3000000, [
    { startDate: '2026-08-15', courseCategory: 'topik', netPrice: 1500000 },
    { startDate: '2026-08-02', courseCategory: 'topik', netPrice: 1500000 },
  ], 1000000)];
  const f = packageFacts(packages, []).get('p2');
  assert.deepEqual(f.close, { date: '2026-08-02', month: '2026-08', estimated: true });
});

test('chưa đóng đồng nào → chưa chốt', () => {
  const f = packageFacts([pkg('p3', 1000, [{ startDate: '2026-09-01' }])], []).get('p3');
  assert.equal(f.close, null);
  assert.equal(f.debt, 1000);
});

test('gom theo tháng: tổng, đã đóng kẹp, công nợ, cơ cấu theo giá bán, cờ ước lượng', () => {
  const packages = [
    pkg('a', 7000000, [
      { startDate: '2026-09-02', courseCategory: 'conversation', netPrice: 2625000 },
      { startDate: '2026-09-02', courseCategory: 'conversation', netPrice: 2625000 },
      { startDate: '2026-09-02', courseCategory: 'topik', netPrice: 1750000, status: 'dropped' },
    ]),
    pkg('b', 2990000, [{ startDate: '2026-09-10', courseCategory: 'bundle', netPrice: 2990000 }], 500000),
    pkg('c', 1000, [{ startDate: '2026-08-01', courseCategory: 'beginner', netPrice: 1000 }]),
  ];
  const payments = [
    { packageId: 'a', amount: 2000000, paidAt: '2026-09-03T02:00:00Z' },
    { packageId: 'c', amount: 1000, paidAt: '2026-08-02T02:00:00Z' },
  ];
  const facts = packageFacts(packages, payments);
  const all = aggregateByMonth(packages, facts, {});
  assert.deepEqual(all['2026-09'], {
    revenue: 9990000, collected: 2500000, debt: 7490000, hasEstimated: true,
    breakdown: { beginner: 0, intermediate: 0, topik: 1750000, conversation: 5250000, bundle: 2990000 },
  });
  assert.equal(all['2026-08'].revenue, 1000);

  const sep = aggregateByMonth(packages, facts, { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(Object.keys(sep), ['2026-09']);
});

// ── Bucket theo ngày / tuần ISO / tháng ────────────────────────────────────────────────────
const {
  isoWeekKeyOf, isoWeekRange, bucketKeyOf, bucketRangeOf,
  aggregateByBucket, aggregateCashByBucket, bucketExpensesBy,
} = require('../src/utils/revenueModel');


// Gom tiền mặt cần thêm ngữ cảnh gói (lịch sử ghi nhận, ngày tạo) và ngày thêm học sinh.
const cashOf = (packages, facts, payments, opts = {}) => {
  const paymentsByPkg = new Map();
  for (const p of payments) {
    const id = String(p.packageId);
    if (!paymentsByPkg.has(id)) paymentsByPkg.set(id, []);
    paymentsByPkg.get(id).push(p);
  }
  return aggregateCashByBucket(packages, facts, {
    paymentsByPkg,
    studentCreatedAt: new Map(opts.studentCreatedAt || []),
    ...opts,
  });
};

test('tuần ISO: khoá theo NĂM ISO nên tuần chéo năm không bị cắt đôi', () => {
  // 29/12/2025 (T2) → 04/01/2026 (CN) là MỘT tuần, thuộc năm ISO 2026.
  assert.equal(isoWeekKeyOf('2025-12-29'), '2026-W01');
  assert.equal(isoWeekKeyOf('2026-01-01'), '2026-W01');
  assert.equal(isoWeekKeyOf('2026-01-04'), '2026-W01');
  assert.equal(isoWeekKeyOf('2026-01-05'), '2026-W02');
  // Năm có 53 tuần: 01/01/2021 vẫn thuộc tuần 53 của năm ISO 2020.
  assert.equal(isoWeekKeyOf('2021-01-01'), '2020-W53');
  assert.deepEqual(isoWeekRange('2026-W01'), { start: '2025-12-29', end: '2026-01-04' });
});

test('tuần ISO chạy T2 → CN và mọi ngày đều rơi đúng vào khoảng của khoá mình', () => {
  let mismatched = 0;
  for (let t = Date.UTC(2024, 0, 1); t <= Date.UTC(2027, 0, 1); t += 24 * 3600 * 1000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const { start, end } = isoWeekRange(isoWeekKeyOf(d));
    if (d < start || d > end) mismatched++;
    if (new Date(`${start}T00:00:00Z`).getUTCDay() !== 1) mismatched++;  // start luôn là thứ 2
  }
  assert.equal(mismatched, 0);
});

test('bucketKeyOf/bucketRangeOf cho cả 3 grain, tháng 2 năm nhuận không hụt ngày', () => {
  assert.equal(bucketKeyOf('2026-09-18', 'day'), '2026-09-18');
  assert.equal(bucketKeyOf('2026-09-18', 'week'), '2026-W38');
  assert.equal(bucketKeyOf('2026-09-18', 'month'), '2026-09');
  assert.deepEqual(bucketRangeOf('2026-09-18', 'day'), { start: '2026-09-18', end: '2026-09-18' });
  assert.deepEqual(bucketRangeOf('2024-02', 'month'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(bucketRangeOf('2026-02', 'month'), { start: '2026-02-01', end: '2026-02-28' });
});

test('gom theo ngày: cả gói vào ĐÚNG ngày chốt, đóng nốt hôm khác không tách ra', () => {
  const packages = [pkg('p1', 5500000, [{ startDate: '2026-09-01', courseCategory: 'topik', netPrice: 5500000 }])];
  const payments = [
    { packageId: 'p1', amount: 500000, paidAt: '2026-09-01T03:00:00Z' },
    { packageId: 'p1', amount: 5000000, paidAt: '2026-09-20T03:00:00Z' },
  ];
  const facts = packageFacts(packages, payments);
  const byDay = aggregateByBucket(packages, facts, { grain: 'day' });
  assert.deepEqual(Object.keys(byDay), ['2026-09-01']);
  assert.equal(byDay['2026-09-01'].revenue, 5500000);
  assert.equal(byDay['2026-09-01'].collected, 5500000);

  // Còn tiền mặt thực thu thì tách đúng theo ngày đóng thật — đây là điểm khác nhau.
  const { byBucket: cash } = cashOf(packages, facts, payments, { grain: 'day' });
  assert.deepEqual(cash, { '2026-09-01': 500000, '2026-09-20': 5000000 });
});

test('tổng tiền mặt thực thu = tổng đã đóng, chỉ khác chỗ rơi vào bucket nào', () => {
  const packages = [
    pkg('p1', 3000000, [{ startDate: '2026-09-01', courseCategory: 'topik', netPrice: 3000000 }]),
    pkg('p2', 2000000, [{ startDate: '2026-10-01', courseCategory: 'beginner', netPrice: 2000000 }]),
  ];
  const payments = [
    { packageId: 'p1', amount: 1000000, paidAt: '2026-09-05T03:00:00Z' },
    { packageId: 'p1', amount: 2000000, paidAt: '2026-11-05T03:00:00Z' },
    { packageId: 'p2', amount: 2000000, paidAt: '2026-10-02T03:00:00Z' },
  ];
  const facts = packageFacts(packages, payments);
  const closedTotal = Object.values(aggregateByBucket(packages, facts, { grain: 'month' }))
    .reduce((s, m) => s + m.collected, 0);
  const cashByMonth = cashOf(packages, facts, payments, { grain: 'month' }).byBucket;
  const cashTotal = Object.values(cashByMonth).reduce((a, b) => a + b, 0);
  assert.equal(closedTotal, cashTotal);
  assert.equal(cashTotal, 5000000);
});

test('grain month cho kết quả y hệt aggregateByMonth cũ', () => {
  const packages = [
    pkg('p1', 3000000, [{ startDate: '2026-09-01', courseCategory: 'topik', netPrice: 3000000 }]),
    pkg('p2', 2000000, [{ startDate: '2026-10-01', courseCategory: 'beginner', netPrice: 2000000 }]),
  ];
  const payments = [
    { packageId: 'p1', amount: 1000000, paidAt: '2026-09-05T03:00:00Z' },
    { packageId: 'p2', amount: 2000000, paidAt: '2026-10-02T03:00:00Z' },
  ];
  const facts = packageFacts(packages, payments);
  assert.deepEqual(
    aggregateByBucket(packages, facts, { grain: 'month' }),
    aggregateByMonth(packages, facts, {}),
  );
});

test('tiền mặt thực thu cắt ngày theo giờ VN, không theo UTC', () => {
  // 17:30 UTC ngày 30/09 = 00:30 ngày 01/10 giờ VN → phải thuộc ngày 01/10.
  const packages = [pkg('p1', 100, [{ startDate: '2026-09-30', courseCategory: 'topik', netPrice: 100 }])];
  const payments = [{ packageId: 'p1', amount: 100, paidAt: '2026-09-30T17:30:00Z' }];
  const { byBucket } = cashOf(packages, packageFacts(packages, payments), payments, { grain: 'day' });
  assert.deepEqual(byBucket, { '2026-10-01': 100 });
});

test('khoản chi gom theo tuần của ngày chi; khoản thiếu ngày chi lùi về mùng 1 của nhãn tháng', () => {
  const { byBucket, total } = bucketExpensesBy([
    { category: 'rent', amount: 6800000, paidAt: '2026-09-18T03:00:00Z' },
    { category: 'utilities', amount: 1200000, paidAt: '2026-09-14T03:00:00Z' },
    { category: 'other', amount: 500000, month: '2026-09' },
  ], { grain: 'week' });
  assert.equal(total, 8500000);
  assert.equal(byBucket['2026-W38'].total, 8000000);   // 14/09 và 18/09 cùng tuần
  assert.equal(byBucket['2026-W36'].total, 500000);    // 01/09 là thứ 3 tuần 36
});

test('bộ lọc from/to cắt theo ngày ở mọi grain', () => {
  const payments = [
    { packageId: 'p1', amount: 10, paidAt: '2026-09-13T03:00:00Z' },
    { packageId: 'p1', amount: 20, paidAt: '2026-09-14T03:00:00Z' },
  ];
  const packages = [pkg('p1', 30, [{ startDate: '2026-09-13', courseCategory: 'topik', netPrice: 30 }])];
  const { byBucket } = cashOf(packages, packageFacts(packages, payments), payments, { from: '2026-09-14', grain: 'week' });
  assert.equal(Object.values(byBucket).reduce((a, b) => a + b, 0), 20);
});

// ── Ngày chốt = ngày ĐỒNG TIỀN ĐẦU TIÊN về ────────────────────────────────────────────────
test('nộp thêm cho gói cũ KHÔNG kéo doanh thu về hôm nay', () => {
  // Bug thật đã gặp: học sinh đăng ký tháng 7, cọc bằng tiền nhập tay (không có bản ghi
  // thanh toán). Hôm nay nộp thêm 1tr qua nút "Nộp thêm" → sinh Payment đầu tiên của gói.
  // Bản cũ chỉ nhìn Payment khi tìm ngày chốt nên kéo TRỌN 5tr doanh thu từ tháng 7 sang
  // hôm nay: doanh thu quá khứ bốc hơi, doanh thu hôm nay phồng lên.
  const p = {
    _id: 'a', studentId: 's1', netTotal: 5000000, paidAdjustment: 2000000,
    createdAt: '2026-07-02T03:00:00Z',
    enrollments: [{ startDate: '2026-07-05', courseCategory: 'conversation', netPrice: 5000000 }],
  };
  const trước = packageFacts([p], []).get('a').close;
  const sau = packageFacts([p], [{ packageId: 'a', amount: 1000000, paidAt: '2026-09-18T03:00:00Z' }]).get('a').close;
  assert.deepEqual(trước, { date: '2026-07-02', month: '2026-07', estimated: true });
  assert.deepEqual(sau, trước, 'ngày chốt phải đứng yên khi nộp thêm');
});

test('khoản CÓ chứng từ sớm hơn tiền nhập tay thì ngày chốt hết ước lượng', () => {
  const p = {
    _id: 'b', studentId: 's1', netTotal: 5000000, paidAdjustment: 1000000,
    createdAt: '2026-07-20T03:00:00Z',
    enrollments: [{ startDate: '2026-08-01', courseCategory: 'topik', netPrice: 5000000 }],
  };
  const f = packageFacts([p], [{ packageId: 'b', amount: 4000000, paidAt: '2026-07-10T03:00:00Z' }]).get('b');
  // 10/07 (có chứng từ) sớm hơn 20/07 (ngày tạo gói) → lấy 10/07 và KHÔNG gắn cờ ước lượng.
  assert.deepEqual(f.close, { date: '2026-07-10', month: '2026-07', estimated: false });
});

test('gói migrate bỏ qua createdAt khi tìm ngày chốt, lùi về ngày thêm học sinh', () => {
  const p = {
    _id: 'c', studentId: 's9', netTotal: 3000000, paidAdjustment: 3000000,
    createdAt: '2026-09-16T03:00:00Z', migratedAt: '2026-09-16T03:00:00Z',
    enrollments: [{ startDate: '2026-05-10', courseCategory: 'topik', netPrice: 3000000 }],
  };
  const f = packageFacts([p], [], { studentCreatedAt: new Map([['s9', '2026-03-04T03:00:00Z']]) }).get('c');
  assert.deepEqual(f.close, { date: '2026-03-04', month: '2026-03', estimated: true });
});

test('chưa có đồng nào thì vẫn chưa chốt', () => {
  const p = { _id: 'd', studentId: 's1', netTotal: 1000, paidAdjustment: 0, enrollments: [{ startDate: '2026-09-01' }] };
  assert.equal(packageFacts([p], []).get('d').close, null);
});
