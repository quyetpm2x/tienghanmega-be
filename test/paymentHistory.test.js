const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPaymentHistory } = require('../src/utils/paymentHistory');

test('gộp khoản thu + nộp thêm tay, mới nhất lên đầu, không có phần dư', () => {
  const r = buildPaymentHistory({
    payments: [{ amount: 500000, paidAt: '2026-08-12T03:00:00Z' }],
    adjustmentHistory: [
      { from: 500000, to: 5000000, changedAt: '2026-09-15T08:19:43Z', note: 'nội bộ', changedBy: 'Admin' },
      { from: 5000000, to: 5100000, changedAt: '2026-09-15T08:21:21Z' },
    ],
    paid: 5100000,
  });
  assert.deepEqual(r.map(x => [x.type, x.amount]), [['manual', 100000], ['manual', 4500000], ['payment', 500000]]);
  assert.equal(r.some(x => 'note' in x || 'changedBy' in x), false, 'không lộ ghi chú/tên admin');
});

test('phần đã nộp không có lịch sử (dữ liệu cũ) thành một dòng không ngày ở cuối', () => {
  const r = buildPaymentHistory({ payments: [], adjustmentHistory: [], paid: 1990000 });
  assert.deepEqual(r, [{ type: 'legacy', date: null, amount: 1990000 }]);
});

test('bỏ lần sửa không đổi số tiền', () => {
  const r = buildPaymentHistory({ payments: [], adjustmentHistory: [{ from: 100, to: 100, changedAt: '2026-01-01' }], paid: 100 });
  assert.deepEqual(r.map(x => x.type), ['legacy']);
});
