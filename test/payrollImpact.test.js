const test = require('node:test');
const assert = require('node:assert/strict');
const { payrollImpactByPeriod, applyLinkUpdates } = require('../src/utils/payrollImpact');

const teachers = [{ _id: 't1', name: 'Cô A' }];
const classes = [{ _id: 'c1', name: 'VIP200426 - Mango', days: 'T2', startDate: '2026-06-01', endDate: '2026-06-30', ratePerSession: 200000, teacherId: 't1', teacher: 'Cô A', teacherAssignments: [] }];

test('gắn classId cho buổi "không dạy" mang tên cũ làm lương kỳ giảm đúng đơn giá', () => {
  const before = [
    { _id: 's1', className: 'VIP200426', date: '2026-06-15', status: 'not-taught' }, // lịch T2 15/06 — kỳ 2026-06
    { _id: 's2', className: 'VIP200426', date: '2026-06-16', status: 'not-taught' }, // không phải ngày có lịch → không ảnh hưởng
  ];
  const after = applyLinkUpdates(before, [
    { _id: 's1', classId: 'c1', className: 'VIP200426 - Mango' },
    { _id: 's2', classId: 'c1', className: 'VIP200426 - Mango' },
  ]);
  const rows = payrollImpactByPeriod({
    teachers, classes, sessionsBefore: before, sessionsAfter: after, startDay: 10, todayStr: '2026-09-16',
    payments: [{ teacherId: 't1', periodStart: '2026-06-10', amountPaid: 800000 }],
  });
  // Lịch T2 tháng 6: 01, 08, 15, 22, 29 → kỳ 2026-05 (01, 08) và kỳ 2026-06 (15, 22, 29)
  assert.deepEqual(rows, [{ teacherId: 't1', teacherName: 'Cô A', period: '2026-06', before: 600000, after: 400000, diff: -200000, sessionsBefore: 3, sessionsAfter: 2, paid: 800000 }]);
});

test('không gắn gì thì không có chênh lệch', () => {
  const s = [{ _id: 's1', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-06-15', status: 'not-taught' }];
  assert.deepEqual(payrollImpactByPeriod({ teachers, classes, sessionsBefore: s, sessionsAfter: s, startDay: 10, todayStr: '2026-09-16', payments: [] }), []);
});
