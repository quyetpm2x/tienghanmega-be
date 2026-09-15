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
