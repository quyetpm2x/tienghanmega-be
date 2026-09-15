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

test('nhiều bản ghi cùng lớp + ngày: bản cập nhật gần nhất thắng, không phụ thuộc thứ tự', () => {
  const older = { _id: 'x1', classId: 'c1', className: 'VIP200426', date: '2026-09-14', status: 'not-taught', updatedAt: '2026-06-01T00:00:00Z' };
  const newer = { _id: 'x2', classId: 'c1', className: 'VIP200426 - Mango', date: '2026-09-14', status: 'rescheduled', updatedAt: '2026-07-20T00:00:00Z' };
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [older, newer] })), 600000, 'dời lịch vẫn tính tiền');
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [newer, older] })), 600000, 'đảo thứ tự vẫn ra cùng số');
  // Bản mới nhất là "đã dạy" thì bản "không dạy" cũ hơn không còn hiệu lực
  const taught = { ...newer, _id: 'x3', status: 'taught', updatedAt: '2026-08-01T00:00:00Z' };
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [older, taught] })), 600000);
  // Bản mới nhất là "không dạy" thì bị trừ, dù bản cũ hơn là dạy thay
  const sub = { ...older, _id: 'x4', status: 'substituted', substituteTeacherId: 't2', updatedAt: '2026-05-01T00:00:00Z' };
  const nt = { ...older, _id: 'x5', updatedAt: '2026-08-02T00:00:00Z' };
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [sub, nt] })), 400000);
  assert.equal(total(buildTeacherLedger({ ...base, teacherId: 't2', overrides: [sub, nt] })), 0, 'bản dạy thay cũ không còn hiệu lực');
});

test('tuỳ chọn latestWins=false giữ cách cũ (lấy bản đầu tiên) — chỉ để báo cáo so sánh', () => {
  const a = { classId: 'c1', className: 'X', date: '2026-09-14', status: 'not-taught', updatedAt: '2026-06-01T00:00:00Z' };
  const b = { classId: 'c1', className: 'X', date: '2026-09-14', status: 'rescheduled', updatedAt: '2026-07-20T00:00:00Z' };
  assert.equal(total(buildTeacherLedger({ ...base, overrides: [a, b], latestWins: false })), 400000);
});
