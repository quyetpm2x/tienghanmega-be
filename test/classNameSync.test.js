const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClassLinkPlan, classLinkBulkOps } = require('../src/utils/classNameSync');

const classes = [
  { _id: 'c1', name: 'MG140926' },
  { _id: 'c2', name: 'VIP030826 - Anh Trung' },
  { _id: 'c3', name: 'SC1-A' },
];

test('gắn classId: theo tên hiện tại, theo tên cũ (suy từ học sinh), sửa tên lệch khi đã có classId', () => {
  const plan = buildClassLinkPlan({
    classes,
    students: [{ classId: 'c1', className: 'MG190826' }, { classId: 'c2', className: 'VIP30072026' }],
    enrollments: [{ _id: 'e1', classId: 'c1', className: 'MG190826' }],
    attendances: [
      { _id: 'a1', className: 'MG190826', date: '2026-09-14' },
      { _id: 'a2', className: 'MG190826', date: '2026-09-16' },
      { _id: 'a3', className: 'MG140926', date: '2026-09-16' },
      { _id: 'a4', classId: 'c3', className: 'SC1-OLD', date: '2026-09-01' },
    ],
    sessions: [
      { _id: 's1', className: 'VIP30072026', date: '2026-08-05', status: 'absent', teacherName: 'Cô B' },
      { _id: 's2', className: 'SC1-A', date: '2026-09-01', status: 'taught', teacherName: 'Cô C' },
      { _id: 's3', classId: 'c3', className: 'SC1-A', date: '2026-09-02', status: 'taught', teacherName: 'Cô C' },
    ],
    bonuses: [{ _id: 'b1', classId: 'c1', className: 'MG190826' }, { _id: 'b2', classId: null, className: 'VIP30072026' }],
  });
  const byId = Object.fromEntries(plan.attendanceUpdates.map(u => [u._id, u]));
  assert.deepEqual(byId.a1, { _id: 'a1', classId: 'c1', className: 'MG140926', from: 'MG190826', reason: 'oldName' });
  assert.equal(byId.a3.reason, 'sameName');
  assert.deepEqual(byId.a4, { _id: 'a4', classId: 'c3', className: 'SC1-A', from: 'SC1-OLD', reason: 'nameDrift' });
  assert.equal(byId.a2, undefined, 'a2 trùng ngày với a3 sau khi gắn → xung đột');
  assert.deepEqual(plan.conflicts.map(c => c.attendanceId), ['a2']);
  const sessIds = plan.sessionUpdates.map(u => [u._id, u.reason]);
  assert.deepEqual(sessIds, [['s1', 'oldName'], ['s2', 'sameName']]);
  assert.deepEqual(plan.bonusUpdates.map(u => [u._id, u.classId, u.className]), [['b1', 'c1', 'MG140926'], ['b2', 'c2', 'VIP030826 - Anh Trung']]);
  assert.deepEqual(plan.enrollmentUpdates.map(u => u._id), ['e1']);
  // Ảnh hưởng lương: chỉ buổi dạy đang KHÔNG khớp lớp nào (tên cũ) mới đổi kết quả tính lương.
  assert.deepEqual(plan.payrollImpact, [{ _id: 's1', from: 'VIP30072026', to: 'VIP030826 - Anh Trung', date: '2026-08-05', status: 'absent', teacherName: 'Cô B' }]);
});

test('tên mơ hồ / không rõ thì không gắn, chỉ báo cáo', () => {
  const plan = buildClassLinkPlan({
    classes,
    students: [{ classId: 'c1', className: 'X' }, { classId: 'c2', className: 'X' }],
    enrollments: [],
    attendances: [{ _id: 'a1', className: 'X', date: '2026-01-01' }, { _id: 'a2', className: 'LỚP-MẤT', date: '2026-01-02' }],
    sessions: [{ _id: 's1', className: 'LỚP-MẤT', date: '2026-01-02', status: 'taught' }],
    bonuses: [],
  });
  assert.deepEqual(plan.attendanceUpdates, []);
  assert.deepEqual(plan.sessionUpdates, []);
  assert.deepEqual(plan.ambiguous.map(a => a.name), ['X']);
  assert.deepEqual(plan.unknown.map(u => [u.name, u.attendances, u.sessions]), [['LỚP-MẤT', 1, 1]]);
});

test('lệnh ghi nối lớp không đụng giờ sửa (updatedAt) — giữ thứ tự sửa thật của buổi dạy', () => {
  const TeacherSession = require('../src/models/TeacherSession'); // nạp mongoose trước helper nội bộ của nó
  const castUpdateOne = require('mongoose/lib/helpers/model/castBulkWrite').castUpdateOne;
  const classId = '64b000000000000000000001';
  const [op] = classLinkBulkOps([{ _id: '64b0000000000000000000aa', from: 'VIP30072026', classId, className: 'VIP030826 - Anh Trung' }]);
  const cast = castUpdateOne(TeacherSession, op.updateOne, {}, new Date());
  assert.equal(cast.update.$set.updatedAt, undefined, 'không set updatedAt');
  assert.equal(cast.update.$setOnInsert, undefined);
  assert.equal(String(cast.update.$set.classId), classId);
  assert.equal(cast.update.$set.className, 'VIP030826 - Anh Trung');
  assert.equal(cast.filter.className, 'VIP30072026', 'chỉ ghi nếu tên trên bản ghi vẫn như lúc lập kế hoạch');
});

test('đã nối đúng hết thì không có gì cần làm', () => {
  const plan = buildClassLinkPlan({
    classes, students: [], enrollments: [],
    attendances: [{ _id: 'a1', classId: 'c3', className: 'SC1-A', date: '2026-01-01' }],
    sessions: [{ _id: 's1', classId: 'c3', className: 'SC1-A', date: '2026-01-01', status: 'taught' }],
    bonuses: [{ _id: 'b1', classId: 'c3', className: 'SC1-A' }],
  });
  assert.equal(plan.attendanceUpdates.length + plan.sessionUpdates.length + plan.bonusUpdates.length + plan.enrollmentUpdates.length, 0);
});
