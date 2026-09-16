const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDerivedFilters, sortStudents, summarizeStudents, earliestStartOf } = require('../src/utils/studentQuery');

const stu = (o = {}) => ({
  _id: o._id || 's1',
  name: o.name || 'Học sinh',
  status: o.status || 'active',
  summary: { tuitionStatus: o.tuitionStatus || 'paid' },
  enrollments: o.enrollments || [{ courseTitle: 'COMBO LỘ TRÌNH', startDate: o.startDate || '2026-09-01', status: 'active' }],
});

test('lọc theo tình trạng học phí và trạng thái học', () => {
  const rows = [stu({ _id: 'a', tuitionStatus: 'paid' }), stu({ _id: 'b', tuitionStatus: 'partial' }), stu({ _id: 'c', tuitionStatus: 'paid', status: 'dropped' })];
  assert.deepEqual(applyDerivedFilters(rows, { tuitionStatus: 'paid' }).map(r => r._id), ['a', 'c']);
  assert.deepEqual(applyDerivedFilters(rows, { studentStatus: 'dropped' }).map(r => r._id), ['c']);
  assert.deepEqual(applyDerivedFilters(rows, { tuitionStatus: 'paid', studentStatus: 'active' }).map(r => r._id), ['a']);
});

test('lọc theo khoá học chỉ xét khoá còn đang học', () => {
  const rows = [
    stu({ _id: 'a', enrollments: [{ courseTitle: 'TOPIK 3,4', startDate: '2026-08-01', status: 'active' }] }),
    stu({ _id: 'b', enrollments: [{ courseTitle: 'TOPIK 3,4', startDate: '2026-08-01', status: 'dropped' }] }),
  ];
  assert.deepEqual(applyDerivedFilters(rows, { courseTitle: 'TOPIK 3,4' }).map(r => r._id), ['a']);
});

test('lọc theo có / chưa có tài khoản đăng nhập', () => {
  const rows = [stu({ _id: 'a' }), stu({ _id: 'b' })];
  const accounted = new Set(['a']);
  assert.deepEqual(applyDerivedFilters(rows, { account: 'has-account', accountedIds: accounted }).map(r => r._id), ['a']);
  assert.deepEqual(applyDerivedFilters(rows, { account: 'no-account', accountedIds: accounted }).map(r => r._id), ['b']);
});

test('ngày bắt đầu của học sinh là ngày sớm nhất trong các khoá', () => {
  const s = stu({ enrollments: [{ startDate: '2026-09-10', status: 'active' }, { startDate: '2026-07-02', status: 'active' }] });
  assert.equal(earliestStartOf(s), '2026-07-02');
  assert.equal(earliestStartOf(stu({ enrollments: [] })), '');
});

test('sắp xếp theo ngày bắt đầu, học sinh chưa có ngày xuống cuối', () => {
  const rows = [
    stu({ _id: 'a', startDate: '2026-09-01' }),
    stu({ _id: 'b', startDate: '2026-09-15' }),
    stu({ _id: 'c', enrollments: [] }),
  ];
  assert.deepEqual(sortStudents(rows, 'desc').map(r => r._id), ['b', 'a', 'c']);
  assert.deepEqual(sortStudents(rows, 'asc').map(r => r._id), ['a', 'b', 'c']);
});

test('thống kê đếm theo tình trạng học phí và trạng thái học', () => {
  const rows = [
    stu({ _id: 'a', tuitionStatus: 'paid' }),
    stu({ _id: 'b', tuitionStatus: 'partial', status: 'reserved' }),
    stu({ _id: 'c', tuitionStatus: 'unpaid', status: 'dropped' }),
    stu({ _id: 'd', tuitionStatus: 'paid' }),
  ];
  const s = summarizeStudents(rows);
  assert.equal(s.total, 4);
  assert.equal(s.paid, 2);
  assert.equal(s.partial, 1);
  assert.equal(s.unpaid, 1);
  assert.equal(s.byStatus.active, 2);
  assert.equal(s.byStatus.reserved, 1);
  assert.equal(s.byStatus.dropped, 1);
});
