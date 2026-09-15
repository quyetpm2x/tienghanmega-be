const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionDedupePlan } = require('../src/utils/sessionDedupe');

const classes = [{ _id: 'c1', name: 'VIP26052026 - Ngọc Tuyền' }, { _id: 'c2', name: 'SC1' }];

test('nhóm theo lớp + ngày, giữ bản sửa gần nhất, xoá các bản còn lại', () => {
  const plan = buildSessionDedupePlan({
    classes,
    sessions: [
      { _id: 'a', classId: 'c1', className: 'VIP26052026', date: '2026-07-17', status: 'not-taught', teacherName: 'Cô A', updatedAt: '2026-07-01T00:00:00Z' },
      { _id: 'b', classId: 'c1', className: 'VIP26052026 - Ngọc Tuyền', date: '2026-07-17', status: 'rescheduled', teacherName: 'Cô A', updatedAt: '2026-07-18T00:00:00Z' },
      { _id: 'c', classId: 'c1', className: 'VIP26052026', date: '2026-07-10', status: 'not-taught', teacherName: 'Cô A', updatedAt: '2026-07-02T00:00:00Z' },
      { _id: 'd', classId: 'c1', className: 'VIP26052026 - Ngọc Tuyền', date: '2026-07-10', status: 'not-taught', teacherName: 'Cô A', updatedAt: '2026-07-03T00:00:00Z' },
      { _id: 'e', classId: 'c2', className: 'SC1', date: '2026-07-10', status: 'taught', teacherName: 'Cô B', updatedAt: '2026-07-03T00:00:00Z' },
    ],
  });
  assert.equal(plan.groups.length, 2);
  const g17 = plan.groups.find(g => g.date === '2026-07-17');
  assert.equal(g17.keep._id, 'b');
  assert.deepEqual(g17.remove.map(r => r._id), ['a']);
  assert.equal(g17.statusConflict, true, 'trạng thái khác nhau');
  const g10 = plan.groups.find(g => g.date === '2026-07-10');
  assert.equal(g10.statusConflict, false, 'trùng y hệt trạng thái');
  assert.deepEqual(plan.removeIds.sort(), ['a', 'c']);
});

test('giờ sửa bị script hàng loạt ghi đè: giữ bản nhập sau cùng theo ngày tạo, không theo updatedAt', () => {
  const plan = buildSessionDedupePlan({
    classes,
    sessions: [
      // backfill ghi cùng lúc, bản nhập cũ tình cờ được ghi sau vài trăm ms
      { _id: 'old', classId: 'c1', className: 'VIP26052026', date: '2026-07-17', status: 'not-taught', createdAt: '2026-07-20T09:50:24Z', updatedAt: '2026-09-15T18:11:57.900Z' },
      { _id: 'new', classId: 'c1', className: 'VIP26052026', date: '2026-07-17', status: 'rescheduled', createdAt: '2026-08-11T09:05:18Z', updatedAt: '2026-09-15T18:11:57.100Z' },
    ],
  });
  assert.equal(plan.groups[0].keep._id, 'new');
  assert.deepEqual(plan.removeIds, ['old']);
});

test('bản tạo trước nhưng dời lịch sau khi bản kia được tạo thì là bản mới nhất', () => {
  const plan = buildSessionDedupePlan({
    classes,
    sessions: [
      { _id: 'a', classId: 'c1', className: 'VIP26052026', date: '2026-06-12', status: 'rescheduled', createdAt: '2026-07-19T02:44:23Z', updatedAt: '2026-09-15T18:11:57Z', rescheduleHistory: [{ date: '2026-06-14', savedAt: '2026-08-20T00:00:00Z' }] },
      { _id: 'b', classId: 'c1', className: 'VIP26052026', date: '2026-06-12', status: 'not-taught', createdAt: '2026-08-17T03:52:02Z', updatedAt: '2026-09-15T18:11:58Z' },
    ],
  });
  assert.equal(plan.groups[0].keep._id, 'a');
});

test('không có trùng thì không có gì', () => {
  const plan = buildSessionDedupePlan({ classes, sessions: [{ _id: 'x', classId: 'c2', className: 'SC1', date: '2026-07-10', status: 'taught' }] });
  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.removeIds, []);
});
