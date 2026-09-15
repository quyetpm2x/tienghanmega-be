const test = require('node:test');
const assert = require('node:assert/strict');
const {
  priceItems, paymentState, deriveStudentStatus, commissionOf, PackageMathError, normalizeEnrollmentStatus,
} = require('../src/utils/packageMath');

test('auto: chia giảm theo tỉ lệ giá niêm yết', () => {
  const r = priceItems({
    discount: 1000000, discountAllocation: 'auto',
    items: [{ listPrice: 3000000 }, { listPrice: 3000000 }, { listPrice: 2000000 }],
  });
  assert.equal(r.listTotal, 8000000);
  assert.equal(r.netTotal, 7000000);
  assert.deepEqual(r.items.map(i => i.discountShare), [375000, 375000, 250000]);
  assert.deepEqual(r.items.map(i => i.netPrice), [2625000, 2625000, 1750000]);
});

test('manual: tổng phần chia admin nhập trở thành discount', () => {
  const r = priceItems({
    discount: 999, discountAllocation: 'manual',
    items: [{ listPrice: 3000000, discountShare: 1000000 }, { listPrice: 2000000, discountShare: 0 }],
  });
  assert.equal(r.discount, 1000000);
  assert.equal(r.netTotal, 4000000);
  assert.deepEqual(r.items.map(i => i.netPrice), [2000000, 2000000]);
});

test('gói không giảm giá', () => {
  const r = priceItems({ discount: 0, discountAllocation: 'auto', items: [{ listPrice: 2990000 }] });
  assert.equal(r.netTotal, 2990000);
  assert.equal(r.items[0].discountShare, 0);
});

test('từ chối gói sai', () => {
  const bad = [
    { discount: 0, discountAllocation: 'auto', items: [] },
    { discount: 9000000, discountAllocation: 'auto', items: [{ listPrice: 8000000 }] },
    { discount: -1, discountAllocation: 'auto', items: [{ listPrice: 100 }] },
    { discount: 0, discountAllocation: 'auto', items: [{ listPrice: 1.5 }] },
    { discount: 0, discountAllocation: 'manual', items: [{ listPrice: 100, discountShare: 101 }] },
    { discount: 0, discountAllocation: 'weird', items: [{ listPrice: 100 }] },
  ];
  for (const b of bad) assert.throws(() => priceItems(b), PackageMathError);
});

test('trạng thái học phí và kẹp đóng dư', () => {
  assert.deepEqual(paymentState({ netTotal: 7000000, paymentsTotal: 0, paidAdjustment: 0 }),
    { paidRaw: 0, paid: 0, debt: 7000000, tuitionStatus: 'unpaid' });
  assert.deepEqual(paymentState({ netTotal: 7000000, paymentsTotal: 2000000, paidAdjustment: 0 }),
    { paidRaw: 2000000, paid: 2000000, debt: 5000000, tuitionStatus: 'partial' });
  assert.deepEqual(paymentState({ netTotal: 2990000, paymentsTotal: 7000000, paidAdjustment: 0 }),
    { paidRaw: 7000000, paid: 2990000, debt: 0, tuitionStatus: 'paid' });
  assert.deepEqual(paymentState({ netTotal: 500, paymentsTotal: 800, paidAdjustment: -400 }),
    { paidRaw: 400, paid: 400, debt: 100, tuitionStatus: 'partial' });
  assert.deepEqual(paymentState({ netTotal: 500, paymentsTotal: 0, paidAdjustment: -100 }),
    { paidRaw: -100, paid: 0, debt: 500, tuitionStatus: 'unpaid' });
});

test('trạng thái học sinh suy từ ghi danh', () => {
  assert.equal(deriveStudentStatus(['dropped', 'active', 'completed']), 'active');
  assert.equal(deriveStudentStatus(['completed', 'reserved']), 'reserved');
  assert.equal(deriveStudentStatus(['dropped', 'transferred']), 'transferred');
  assert.equal(deriveStudentStatus(['unassigned', 'active']), 'active');
  assert.equal(deriveStudentStatus(['unassigned', 'reserved', 'completed']), 'unassigned');
  assert.equal(normalizeEnrollmentStatus(undefined, true), 'active');
  assert.equal(normalizeEnrollmentStatus(undefined, false), 'unassigned');
  assert.equal(normalizeEnrollmentStatus('active', false), 'unassigned');
  assert.equal(normalizeEnrollmentStatus('unassigned', true), 'active');
  assert.equal(normalizeEnrollmentStatus('dropped', false), 'dropped');
  assert.equal(normalizeEnrollmentStatus('reserved', true), 'reserved');
  assert.equal(deriveStudentStatus(['completed', 'dropped']), 'completed');
  assert.equal(deriveStudentStatus(['dropped']), 'dropped');
  assert.equal(deriveStudentStatus([]), null);
});

test('hoa hồng 10% giá niêm yết', () => {
  assert.deepEqual(commissionOf(8000000), { basePrice: 8000000, rate: 0.1, amount: 800000 });
  assert.deepEqual(commissionOf(2990005), { basePrice: 2990005, rate: 0.1, amount: 299001 });
});
const { summarizePackages } = require('../src/utils/packageMath');

test('tổng hợp nhiều gói của một học sinh', () => {
  const s = summarizePackages([
    { listTotal: 8000000, discount: 1000000, netTotal: 7000000, paid: 7000000, debt: 0, tuitionStatus: 'paid' },
    { listTotal: 2000000, discount: 0, netTotal: 2000000, paid: 500000, debt: 1500000, tuitionStatus: 'partial' },
  ]);
  assert.deepEqual(s, { listTotal: 10000000, discount: 1000000, netTotal: 9000000, paid: 7500000, debt: 1500000, tuitionStatus: 'partial' });
});

test('tổng hợp: tất cả đã đủ → paid; chưa đóng gì → unpaid; không gói → unpaid', () => {
  const paid = { listTotal: 1, discount: 0, netTotal: 1, paid: 1, debt: 0, tuitionStatus: 'paid' };
  const none = { listTotal: 1, discount: 0, netTotal: 1, paid: 0, debt: 1, tuitionStatus: 'unpaid' };
  assert.equal(summarizePackages([paid, paid]).tuitionStatus, 'paid');
  assert.equal(summarizePackages([none, none]).tuitionStatus, 'unpaid');
  assert.equal(summarizePackages([]).tuitionStatus, 'unpaid');
});
