const test = require('node:test');
const assert = require('node:assert/strict');
const { groupPaymentsByStudent } = require('../src/utils/paymentGrouping');

const row = (o) => ({ kind: 'payment', date: '2026-09-15', closeDate: '2026-09-15', studentId: 's1', studentName: 'Phương Anhh', className: 'LỘ TRÌNH T04', courseCategory: 'beginner', amount: 1000000, note: '', ...o });

test('gộp các lần đóng của cùng học sinh thành 1 dòng, giữ chi tiết bên trong', () => {
  const groups = groupPaymentsByStudent([
    row({ _id: 'p1', amount: 1500000 }),
    row({ _id: 'p2', amount: 1490000, kind: 'manual', date: null }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].amount, 2990000);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].hasManual, true);
  assert.deepEqual(groups[0].items.map(i => i._id), ['p1', 'p2']);
});

test('học sinh học nhiều lớp: gộp chung, liệt kê đủ lớp và khoá', () => {
  const groups = groupPaymentsByStudent([
    row({ _id: 'p1', className: 'LỘ TRÌNH T04', courseCategory: 'beginner' }),
    row({ _id: 'p2', className: 'Giao Tiếp Cơ Bản T09', courseCategory: 'conversation' }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].classNames, ['LỘ TRÌNH T04', 'Giao Tiếp Cơ Bản T09']);
  assert.deepEqual(groups[0].courseCategories, ['beginner', 'conversation']);
});

test('trùng tên nhưng khác học sinh thì không gộp', () => {
  const groups = groupPaymentsByStudent([
    row({ _id: 'p1', studentId: 's1' }),
    row({ _id: 'p2', studentId: 's2' }),
  ]);
  assert.equal(groups.length, 2);
});

test('dòng điều chỉnh tay không có ngày đóng vẫn xếp theo ngày chốt', () => {
  const groups = groupPaymentsByStudent([
    row({ _id: 'p1', studentId: 's1', date: '2026-09-10', closeDate: '2026-09-10' }),
    row({ _id: 'p2', studentId: 's2', kind: 'manual', date: null, closeDate: '2026-09-14' }),
  ]);
  assert.deepEqual(groups.map(g => g.studentId), ['s2', 's1'], 'nhóm mới nhất lên đầu');
  assert.equal(groups[0].date, null, 'nhóm chỉ có điều chỉnh tay thì không có ngày đóng');
  assert.equal(groups[0].closeDate, '2026-09-14');
});

test('ngày đóng của nhóm là lần đóng gần nhất', () => {
  const groups = groupPaymentsByStudent([
    row({ _id: 'p1', date: '2026-09-02' }),
    row({ _id: 'p2', date: '2026-09-15' }),
  ]);
  assert.equal(groups[0].date, '2026-09-15');
  assert.deepEqual(groups[0].items.map(i => i._id), ['p2', 'p1'], 'chi tiết cũng mới nhất lên đầu');
});
