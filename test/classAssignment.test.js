const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveAssignments, teacherIdOnDate } = require('../src/utils/classAssignment');

test('lớp chưa từng đổi giáo viên: suy một đoạn từ teacherId hiện tại', () => {
  const c = { teacherId: 'T1', teacher: 'CÔ A', startDate: '2026-07-21' };
  assert.deepEqual(effectiveAssignments(c), [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: null },
  ]);
});

test('lớp không có giáo viên nào: mảng rỗng', () => {
  assert.deepEqual(effectiveAssignments({ startDate: '2026-07-21' }), []);
});

test('có teacherAssignments thì dùng nguyên mảng đó', () => {
  const list = [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-31' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null },
  ];
  assert.deepEqual(effectiveAssignments({ teacherId: 'T2', teacherAssignments: list }), list);
});

test('teacherIdOnDate trả đúng người phụ trách tại ngày đó', () => {
  const c = { teacherId: 'T2', teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-31' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null },
  ] };
  assert.equal(teacherIdOnDate(c, '2026-08-15'), 'T1');
  assert.equal(teacherIdOnDate(c, '2026-09-15'), 'T2');
  assert.equal(teacherIdOnDate(c, '2026-07-01'), null, 'trước mọi đoạn thì không ai phụ trách');
});
