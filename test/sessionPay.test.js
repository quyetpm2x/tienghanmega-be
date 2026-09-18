const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSession, paidTeacherIdOf } = require('../src/utils/sessionPay');

const cls = {
  teacherId: 'T2', ratePerSession: 200000,
  startDate: '2026-07-21', endDate: null, days: 'T3,T5', course: 'TOPIK I',
  teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-31' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null },
  ],
  rateHistory: [{ rate: 300000, fromDate: '2026-09-01', toDate: null, teacherIds: [] }],
};

test('bản ghi CŨ (không có field mới): kỳ lương, giảng viên, đơn giá đều theo ngày gốc', () => {
  const s = { date: '2026-08-11', status: 'rescheduled', rescheduledDate: '2026-09-20' };
  const r = resolveSession(cls, s, 'T1');
  assert.equal(r.payDate, '2026-08-11', 'KHÔNG được nhảy sang ngày bù');
  assert.equal(r.teacherId, 'T1');
  assert.equal(r.rate, 200000, 'đơn giá của ngày gốc, không phải mức mới từ 01/09');
});

test('bản ghi MỚI có payDate: kỳ lương theo ngày dạy thật', () => {
  const s = { date: '2026-08-11', status: 'rescheduled', rescheduledDate: '2026-09-20', payDate: '2026-09-20' };
  assert.equal(resolveSession(cls, s, 'T1').payDate, '2026-09-20');
});

test('paidTeacherId ghi đè người được tính buổi, và đơn giá đi theo người đó', () => {
  const s = { date: '2026-08-11', status: 'rescheduled', payDate: '2026-09-20', paidTeacherId: 'T2' };
  const r = resolveSession(cls, s, 'T1');
  assert.equal(r.teacherId, 'T2');
  assert.equal(r.rate, 200000, 'vẫn lấy đơn giá tại NGÀY GỐC, chỉ đổi người');
});

test('paidRate ghi đè đơn giá cho đúng buổi đó', () => {
  const s = { date: '2026-08-11', paidRate: 150000 };
  assert.equal(resolveSession(cls, s, 'T1').rate, 150000);
});

test('buổi dạy thay CŨ vẫn chạy y hệt: substituteRate + substituteTeacherId', () => {
  const s = { date: '2026-08-11', status: 'substituted', substituteTeacherId: 'T9', substituteRate: 250000 };
  assert.equal(paidTeacherIdOf(s), 'T9');
  assert.equal(resolveSession(cls, s, 'T1').rate, 250000);
});

test('buổi dạy thay cũ không set substituteRate thì lấy đơn giá lớp tại ngày gốc', () => {
  const s = { date: '2026-08-11', status: 'substituted', substituteTeacherId: 'T9' };
  assert.equal(resolveSession(cls, s, 'T1').rate, 200000);
});

test('paidRate thắng substituteRate', () => {
  const s = { date: '2026-08-11', status: 'substituted', substituteTeacherId: 'T9', substituteRate: 250000, paidRate: 111000 };
  assert.equal(resolveSession(cls, s, 'T1').rate, 111000);
});

test('buổi bình thường không có override: mọi thứ suy từ lớp', () => {
  const s = { date: '2026-09-03', status: 'taught' };
  const r = resolveSession(cls, s, 'T2');
  assert.equal(r.payDate, '2026-09-03');
  assert.equal(r.teacherId, 'T2');
  assert.equal(r.rate, 300000);
});
