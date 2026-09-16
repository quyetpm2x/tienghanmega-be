const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExpenseBody } = require('../src/utils/expenseInput');

test('tháng tự suy từ ngày chi (giờ VN), không nhận tháng do client gửi', () => {
  const b = normalizeExpenseBody({ month: '2026-09', paidAt: '2026-08-16', amount: 1400000, category: 'utilities' });
  assert.equal(b.month, '2026-08');
  assert.equal(b.amount, 1400000);
  assert.equal(b.category, 'utilities');
});

test('ngày chi cuối tháng vẫn đúng tháng theo giờ VN', () => {
  assert.equal(normalizeExpenseBody({ paidAt: '2026-08-31', amount: 1, category: 'rent' }).month, '2026-08');
  assert.equal(normalizeExpenseBody({ paidAt: '2026-09-01', amount: 1, category: 'rent' }).month, '2026-09');
});

test('thiếu ngày chi / số tiền / loại chi phí thì báo lỗi', () => {
  assert.throws(() => normalizeExpenseBody({ amount: 1000, category: 'rent' }), /ngày chi/i);
  assert.throws(() => normalizeExpenseBody({ paidAt: '2026-08-16', category: 'rent' }), /số tiền/i);
  assert.throws(() => normalizeExpenseBody({ paidAt: '2026-08-16', amount: 0, category: 'rent' }), /số tiền/i);
  assert.throws(() => normalizeExpenseBody({ paidAt: '2026-08-16', amount: 1000 }), /loại chi phí/i);
});

test('ngày chi sai định dạng thì báo lỗi', () => {
  assert.throws(() => normalizeExpenseBody({ paidAt: 'hôm qua', amount: 1000, category: 'rent' }), /ngày chi/i);
});

test('sửa chi phí: chỉ gửi ghi chú thì không bắt nhập lại mọi thứ', () => {
  const b = normalizeExpenseBody({ note: 'sửa ghi chú' }, { partial: true });
  assert.deepEqual(b, { note: 'sửa ghi chú' });
});

test('sửa chi phí: đổi ngày chi thì tháng đổi theo', () => {
  const b = normalizeExpenseBody({ paidAt: '2026-07-05' }, { partial: true });
  assert.equal(b.month, '2026-07');
});
