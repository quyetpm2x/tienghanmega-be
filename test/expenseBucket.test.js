const test = require('node:test');
const assert = require('node:assert/strict');
const { expenseMonthKey, bucketExpenses } = require('../src/utils/revenueModel');

const exp = (o) => ({ month: '2026-09', amount: 1000000, category: 'rent', ...o });

test('khoản chi xếp theo THÁNG CỦA NGÀY CHI, không theo nhãn tháng nhập tay', () => {
  // Nhãn "tháng 9" nhưng chi ngày 16/08 → thuộc tháng 8
  assert.equal(expenseMonthKey(exp({ month: '2026-09', paidAt: new Date('2026-08-16T03:00:00Z') })), '2026-08');
});

test('không có ngày chi thì dùng nhãn tháng như cũ', () => {
  assert.equal(expenseMonthKey(exp({ month: '2026-09', paidAt: null })), '2026-09');
});

test('cắt ngày theo giờ Việt Nam', () => {
  // 31/08 lúc 18h UTC = 01/09 giờ VN → thuộc tháng 9
  assert.equal(expenseMonthKey(exp({ month: '2026-08', paidAt: new Date('2026-08-31T18:00:00Z') })), '2026-09');
});

test('gom theo tháng và lọc theo khoảng ngày chi', () => {
  const rows = [
    exp({ month: '2026-09', amount: 1400000, category: 'utilities', paidAt: new Date('2026-08-16T03:00:00Z') }),
    exp({ month: '2026-08', amount: 7000000, category: 'rent', paidAt: new Date('2026-08-27T03:00:00Z') }),
    exp({ month: '2026-08', amount: 5000000, category: 'rent', paidAt: new Date('2026-07-10T03:00:00Z') }), // ngoài khoảng
  ];
  const { byMonth, total } = bucketExpenses(rows, { from: '2026-08-01', to: '2026-08-31' });
  assert.equal(total, 8400000, 'chỉ cộng khoản chi trong khoảng');
  assert.deepEqual(Object.keys(byMonth), ['2026-08'], 'tất cả phải nằm ở tháng 8');
  assert.equal(byMonth['2026-08'].total, 8400000);
  assert.equal(byMonth['2026-08'].utilities, 1400000);
  assert.equal(byMonth['2026-08'].rent, 7000000);
});

test('không truyền khoảng thì lấy hết', () => {
  const { byMonth, total } = bucketExpenses([
    exp({ amount: 1000, paidAt: new Date('2026-08-05T03:00:00Z') }),
    exp({ amount: 2000, paidAt: new Date('2026-09-05T03:00:00Z') }),
  ], {});
  assert.equal(total, 3000);
  assert.deepEqual(Object.keys(byMonth).sort(), ['2026-08', '2026-09']);
});
