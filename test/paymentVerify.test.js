const test = require('node:test');
const assert = require('node:assert/strict');
const { verifiedAfterUpsert, isAbnormalPayment } = require('../src/utils/paymentVerify');

test('đánh dấu đã kiểm bị bỏ khi số tiền đã trả đổi', () => {
  assert.equal(verifiedAfterUpsert({ amountPaid: 3000000, verified: true }, { amountPaid: 3500000 }), false);
});

test('sửa mỗi ghi chú thì giữ nguyên đã kiểm', () => {
  assert.equal(verifiedAfterUpsert({ amountPaid: 3000000, verified: true }, { amountPaid: 3000000 }), true);
});

test('bản ghi mới chưa kiểm', () => {
  assert.equal(verifiedAfterUpsert(null, { amountPaid: 3000000 }), false);
});

test('chưa từng kiểm thì vẫn chưa kiểm dù số tiền không đổi', () => {
  assert.equal(verifiedAfterUpsert({ amountPaid: 3000000, verified: false }, { amountPaid: 3000000 }), false);
});

test('bất thường khi số tiền trả khác số tự tính, lệch dưới 1đ coi như bằng', () => {
  assert.equal(isAbnormalPayment(3360000, 0), true);
  assert.equal(isAbnormalPayment(4200000, 4200000), false);
  assert.equal(isAbnormalPayment(595205006.8, 595205007), false, 'phần lẻ do làm tròn không tính là bất thường');
  assert.equal(isAbnormalPayment(5240000, 5480000), true);
});
