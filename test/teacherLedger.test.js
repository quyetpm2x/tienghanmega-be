const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTeacherLedger } = require('../src/utils/teacherLedger');

const T = 't1';
const cls = { _id: 'c1', name: 'VIP200426 - Mango', days: 'T2', startDate: '2026-09-07', endDate: '2026-09-21', ratePerSession: 200000, teacherId: T, teacher: 'Cô A', teacherAssignments: [] };
const base = { teacherId: T, classes: [cls], bonuses: [], commissions: [], todayStr: '2026-09-30' };
const total = items => items.reduce((s, i) => s + i.amount, 0);

test('không có ngoại lệ: mọi buổi theo lịch là đã dạy (07, 14, 21/09)', () => {
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [] })), 600000);
});

test('ngoại lệ mang classId được áp dụng dù tên lớp trên bản ghi là tên cũ', () => {
  const overrides = [{ classId: 'c1', className: 'VIP200426', date: '2026-09-14', status: 'absent' }];
  assert.equal(total(buildTeacherLedger({ ...base, overrides })), 400000);
});

test('bản ghi cũ chưa có classId: vẫn so theo tên như trước (tên cũ thì không áp dụng)', () => {
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [{ className: 'VIP200426 - Mango', date: '2026-09-14', status: 'absent' }] })), 400000);
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [{ className: 'VIP200426', date: '2026-09-14', status: 'absent' }] })), 600000);
});

test('dạy thay: buổi chuyển sang giáo viên dạy thay, đơn giá tra theo classId', () => {
  const overrides = [{ classId: 'c1', className: 'VIP200426', date: '2026-09-21', status: 'substituted', teacherName: 'Cô A', substituteTeacherId: 't2', substituteRate: null }];
  assert.equal(total(buildTeacherLedger({ ...base, overrides })), 400000, 'giáo viên gốc mất buổi 21');
  const sub = buildTeacherLedger({ ...base, teacherId: 't2', overrides });
  assert.equal(total(sub), 200000, 'giáo viên dạy thay nhận đơn giá lớp');
});
