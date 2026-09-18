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

test('dữ liệu cũ lấy ngày thêm học sinh làm ngày ước tính và xếp đúng thứ tự', () => {
  const addedAt = '2026-09-14T03:00:00Z';
  const r = buildPaymentHistory({
    payments: [{ amount: 400000, paidAt: '2026-09-20T03:00:00Z' }],
    adjustmentHistory: [],
    paid: 1000000,
    legacyDate: addedAt,
  });
  assert.deepEqual(r.map(x => x.type), ['payment', 'legacy'], 'dòng cũ hơn nằm dưới');
  assert.equal(r[1].date, addedAt);
  assert.equal(r[1].dateEstimated, true);
});

test('bỏ lần sửa không đổi số tiền', () => {
  const r = buildPaymentHistory({ payments: [], adjustmentHistory: [{ from: 100, to: 100, changedAt: '2026-01-01' }], paid: 100 });
  assert.deepEqual(r.map(x => x.type), ['legacy']);
});

// ── Bản cho ADMIN: giữ ghi chú, tên người sửa và thông tin gói ─────────────────
const { buildAdminPaymentHistory } = require('../src/utils/paymentHistory');

test('bản admin giữ ghi chú, tên người sửa và gắn thông tin gói', () => {
  const r = buildAdminPaymentHistory({
    packageId: 'pkg1', packageLabel: 'Gói 1', className: 'LỘ TRÌNH T04',
    payments: [{ _id: 'p1', amount: 500000, paidAt: '2026-08-12T03:00:00Z', note: 'cọc' }],
    adjustmentHistory: [{ from: 500000, to: 2990000, changedAt: '2026-09-15T08:19:43Z', note: 'nhập bù dữ liệu cũ', changedBy: 'Quyet' }],
    paid: 2990000,
  });
  assert.deepEqual(r.map(x => [x.type, x.amount]), [['manual', 2490000], ['payment', 500000]]);
  assert.equal(r[0].note, 'nhập bù dữ liệu cũ');
  assert.equal(r[0].changedBy, 'Quyet');
  assert.equal(r[1].note, 'cọc');
  assert.equal(r[0].packageId, 'pkg1');
  assert.equal(r[0].packageLabel, 'Gói 1');
  assert.equal(r[1].className, 'LỘ TRÌNH T04');
});

test('bản admin: tổng các dòng luôn bằng số đã nộp, phần thiếu thành dòng dữ liệu cũ', () => {
  const r = buildAdminPaymentHistory({
    packageId: 'pkg1',
    payments: [{ _id: 'p1', amount: 1000000, paidAt: '2026-08-12T03:00:00Z' }],
    adjustmentHistory: [],
    paid: 1500000,
  });
  assert.equal(r.reduce((s, x) => s + x.amount, 0), 1500000);
  assert.deepEqual(r.map(x => x.type), ['payment', 'legacy']);
});

// ── "+ Nộp thêm" sinh Payment thật thay vì cộng vào paidAdjustment ────────────────────────

test('khoản thu mang theo người ghi nhận, hiện chung một trường với dòng sửa tay', () => {
  const r = buildAdminPaymentHistory({
    payments: [{ _id: 'x', paidAt: '2026-09-18', amount: 3000000, note: 'ck', recordedBy: 'Quyết' }],
    adjustmentHistory: [],
    paid: 3000000,
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].type, 'payment');
  assert.equal(r[0].changedBy, 'Quyết');
});

test('nộp thêm KHÔNG được ghi cả Payment lẫn adjustmentHistory — sẽ đếm đôi rồi đẻ dòng âm', () => {
  // Đây là cái bẫy của việc chuyển "+ Nộp thêm" sang sinh Payment: nếu vẫn push adjustment
  // như cũ thì lịch sử có 2 dòng +3tr cho cùng một lần đóng, và dòng "legacy" −3tr để bù.
  const saiCach = buildAdminPaymentHistory({
    payments: [{ _id: 'x', paidAt: '2026-09-18', amount: 3000000 }],
    adjustmentHistory: [{ from: 0, to: 3000000, changedAt: '2026-09-18' }],
    paid: 3000000,
  });
  assert.equal(saiCach.length, 3);
  assert.equal(saiCach.filter(i => i.type === 'legacy')[0].amount, -3000000);

  // Cách đang dùng: chỉ Payment, đúng một dòng và tổng khớp.
  const dungCach = buildAdminPaymentHistory({
    payments: [{ _id: 'x', paidAt: '2026-09-18', amount: 3000000 }],
    adjustmentHistory: [],
    paid: 3000000,
  });
  assert.equal(dungCach.length, 1);
  assert.equal(dungCach.reduce((s, i) => s + i.amount, 0), 3000000);
});

test('gói cũ vẫn giữ nguyên lịch sử sửa tay — thay đổi chỉ áp cho lần đóng mới', () => {
  const r = buildAdminPaymentHistory({
    payments: [{ _id: 'x', paidAt: '2026-09-18', amount: 2000000, recordedBy: 'Quyết' }],
    adjustmentHistory: [{ from: 0, to: 1000000, changedAt: '2026-08-01', changedBy: 'Admin cũ' }],
    paid: 3000000,
  });
  assert.equal(r.length, 2);
  assert.equal(r.reduce((s, i) => s + i.amount, 0), 3000000);
  assert.deepEqual(r.map(i => i.type), ['payment', 'manual']);
});
