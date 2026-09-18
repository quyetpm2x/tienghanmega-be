const test = require('node:test');
const assert = require('node:assert/strict');
const { teachersOfPhase } = require('../src/utils/phaseTeacherMigration');
const { effectivePhases } = require('../src/utils/classPhase');
const { buildTeacherLedger } = require('../src/utils/teacherLedger');
const { rateAt } = require('../src/utils/classRate');

// Di trú một lớp = thay phases bằng phiên bản có teachers[].
const migrate = cls => ({
  ...cls,
  phases: effectivePhases(cls).map(p => ({ ...p, teachers: teachersOfPhase(cls, p) })),
});

// Tổng lương của MỌI giảng viên theo MỌI kỳ — dùng để so trước/sau di trú.
const payrollOf = (cls, teacherIds) => {
  const out = {};
  for (const id of teacherIds) {
    const items = buildTeacherLedger({
      teacherId: id, classes: [cls], overrides: [], bonuses: [], commissions: [], todayStr: '2026-12-31',
    });
    out[id] = items.filter(i => i.kind === 'session').reduce((s, i) => s + i.amount, 0);
  }
  return out;
};

const base = {
  _id: 'C1', name: 'VIP01', course: 'TOPIK I', days: 'T2,T4', time: '19:30 - 21:30',
  startDate: '2026-08-03', endDate: '2026-10-30', ratePerSession: 200000,
  teacherId: 'T2', teacher: 'CÔ B',
};

test('lớp đơn giản một giảng viên một mức lương: một đoạn duy nhất', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: null },
  ], rateHistory: [] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.deepEqual(segs, [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-10-30', rate: null },
  ]);
});

test('đổi giảng viên giữa chừng: cắt đúng tại mốc đổi', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-14' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-15', toDate: null },
  ], rateHistory: [] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.equal(segs.length, 2);
  assert.deepEqual(segs.map(s => [s.teacherId, s.fromDate, s.toDate]), [
    ['T1', '2026-08-03', '2026-09-14'],
    ['T2', '2026-09-15', '2026-10-30'],
  ]);
});

test('CÙNG giảng viên nhưng đổi lương giữa chừng: phải cắt thành hai đoạn', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: null },
  ], rateHistory: [{ rate: 260000, fromDate: '2026-09-15', toDate: null, teacherIds: [] }] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.equal(segs.length, 2, 'không cắt thì mất hẳn lần tăng lương');
  assert.deepEqual(segs.map(s => [s.fromDate, s.toDate, s.rate]), [
    ['2026-08-03', '2026-09-14', null],
    ['2026-09-15', '2026-10-30', 260000],
  ]);
});

test('đổi người VÀ đổi lương ở hai mốc khác nhau: cắt theo hợp của cả hai', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-14' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-15', toDate: null },
  ], rateHistory: [{ rate: 260000, fromDate: '2026-10-01', toDate: null, teacherIds: [] }] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.deepEqual(segs.map(s => [s.teacherId, s.fromDate, s.toDate, s.rate]), [
    ['T1', '2026-08-03', '2026-09-14', null],
    ['T2', '2026-09-15', '2026-09-30', null],
    ['T2', '2026-10-01', '2026-10-30', 260000],
  ]);
});

test('mức lương riêng cho MỘT giảng viên được giữ đúng cho người đó', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-14' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-15', toDate: null },
  ], rateHistory: [{ rate: 300000, fromDate: '2026-08-03', toDate: null, teacherIds: ['T2'] }] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.equal(segs.find(s => s.teacherId === 'T1').rate, null, 'CÔ A ăn mức mặc định');
  assert.equal(segs.find(s => s.teacherId === 'T2').rate, 300000, 'CÔ B ăn mức riêng');
});

test('khoảng không ai phụ trách được giữ HỞ, không gán bừa cho ai', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-08-31' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-10-01', toDate: null },
  ], rateHistory: [] };
  const segs = teachersOfPhase(cls, effectivePhases(cls)[0]);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].toDate, '2026-08-31');
  assert.equal(segs[1].fromDate, '2026-10-01', 'tháng 9 không ai phụ trách — để hở');
});

test('LƯƠNG BẤT BIẾN: tổng lương từng giảng viên trước và sau di trú bằng nhau', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-14' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-15', toDate: null },
  ], rateHistory: [
    { rate: 260000, fromDate: '2026-10-01', toDate: null, teacherIds: [] },
    { rate: 310000, fromDate: '2026-08-17', toDate: '2026-08-31', teacherIds: ['T1'] },
  ] };
  const ids = ['T1', 'T2'];
  const before = payrollOf(cls, ids);
  const after = payrollOf(migrate(cls), ids);
  assert.deepEqual(after, before, 'di trú KHÔNG được làm đổi một đồng nào');
  assert.ok(before.T1 > 0 && before.T2 > 0, 'kịch bản phải thực sự có tiền mới có ý nghĩa');
});

test('LƯƠNG BẤT BIẾN: lớp nhiều khoá nối tiếp, mỗi khoá lịch riêng', () => {
  const cls = {
    ...base, endDate: null,
    phases: [
      { courseTitle: 'A', days: 'T2,T4', time: '19:30', fromDate: '2026-08-03', toDate: '2026-09-14' },
      { courseTitle: 'B', days: 'T3,T5', time: '13:00', fromDate: '2026-09-15', toDate: '2026-10-30' },
    ],
    teacherAssignments: [
      { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-30' },
      { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-10-01', toDate: null },
    ],
    rateHistory: [{ rate: 280000, fromDate: '2026-09-01', toDate: null, teacherIds: [] }],
  };
  const ids = ['T1', 'T2'];
  const before = payrollOf(cls, ids);
  const after = payrollOf(migrate(cls), ids);
  assert.deepEqual(after, before, 'lớp nhiều khoá cũng không được lệch');
});

test('đơn giá tra ra sau di trú khớp từng ngày với trước di trú', () => {
  const cls = { ...base, teacherAssignments: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-03', toDate: '2026-09-14' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-15', toDate: null },
  ], rateHistory: [{ rate: 260000, fromDate: '2026-10-01', toDate: null, teacherIds: [] }] };
  const after = migrate(cls);
  for (let d = new Date('2026-08-03'); d <= new Date('2026-10-30'); d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    for (const id of ['T1', 'T2']) {
      assert.equal(rateAt(after, day, id), rateAt(cls, day, id), `lệch đơn giá ngày ${day} cho ${id}`);
    }
  }
});
