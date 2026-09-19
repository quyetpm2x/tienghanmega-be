const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDerivedFilters, sortStudents, summarizeStudents, earliestStartOf,
  matchesPackageCount, matchesRegisteredOn } = require('../src/utils/studentQuery');
const { filterIndexRows } = require('../src/utils/studentIndexPipeline');

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


// ── Lọc theo SỐ GÓI ĐĂNG KÝ ─────────────────────────────────────────────────────────────
test('matchesPackageCount: số trần là khớp đúng, hậu tố + là từ ngần ấy trở lên', () => {
  assert.equal(matchesPackageCount(2, '2'), true);
  assert.equal(matchesPackageCount(3, '2'), false);
  assert.equal(matchesPackageCount(3, '2+'), true);
  assert.equal(matchesPackageCount(1, '2+'), false);
  assert.equal(matchesPackageCount(9, '4+'), true);
});

test('matchesPackageCount: không lọc khi thiếu tham số hoặc tham số rác', () => {
  for (const spec of [undefined, '', 'all', 'abc', '+']) {
    assert.equal(matchesPackageCount(0, spec), true, `spec=${spec}`);
    assert.equal(matchesPackageCount(7, spec), true, `spec=${spec}`);
  }
});

test('lọc theo số gói chạy trên danh sách đã gắn gói', () => {
  const rows = [
    { _id: 'a', packages: [{}], summary: {}, enrollments: [] },
    { _id: 'b', packages: [{}, {}], summary: {}, enrollments: [] },
    { _id: 'c', packages: [{}, {}, {}], summary: {}, enrollments: [] },
  ];
  assert.deepEqual(applyDerivedFilters(rows, { packages: '2' }).map(r => r._id), ['b']);
  assert.deepEqual(applyDerivedFilters(rows, { packages: '2+' }).map(r => r._id), ['b', 'c']);
});

// ── Lọc theo NGÀY ĐĂNG KÝ ───────────────────────────────────────────────────────────────
test('matchesRegisteredOn: khớp khi có ÍT NHẤT MỘT gói đúng ngày', () => {
  assert.equal(matchesRegisteredOn(['2026-01-09', '2026-03-21'], '2026-03-21'), true);
  assert.equal(matchesRegisteredOn(['2026-01-09'], '2026-03-21'), false);
  assert.equal(matchesRegisteredOn([], '2026-03-21'), false);
});

test('matchesRegisteredOn: không có ngày lọc thì giữ nguyên mọi học sinh', () => {
  assert.equal(matchesRegisteredOn([], ''), true);
  assert.equal(matchesRegisteredOn(undefined, undefined), true);
});

test('lọc ngày đăng ký bỏ qua phần giờ nếu lỡ lọt vào', () => {
  const rows = [
    { _id: 'a', packages: [{ registeredAt: '2026-03-21' }], summary: {}, enrollments: [] },
    { _id: 'b', packages: [{ registeredAt: '2026-03-22' }], summary: {}, enrollments: [] },
    { _id: 'c', packages: [{ registeredAt: '' }], summary: {}, enrollments: [] },
  ];
  assert.deepEqual(applyDerivedFilters(rows, { registeredAt: '2026-03-21' }).map(r => r._id), ['a']);
  assert.deepEqual(applyDerivedFilters(rows, { registeredAt: '2026-03-21T00:00:00Z' }).map(r => r._id), ['a']);
});

// ── Hai đường lọc phải cho cùng kết quả ─────────────────────────────────────────────────
// filterIndexRows (có phân trang) và applyDerivedFilters (không phân trang) là hai cài đặt
// khác nhau trên hai hình dạng dữ liệu khác nhau. Test này khoá chúng lại với nhau.
test('filterIndexRows và applyDerivedFilters khớp nhau ở số gói và ngày đăng ký', () => {
  const spec = [
    { id: 'a', dates: ['2026-03-21'] },
    { id: 'b', dates: ['2026-03-21', '2026-05-02'] },
    { id: 'c', dates: ['2026-05-02', '2026-06-01', '2026-07-01'] },
    { id: 'd', dates: [] },
  ];
  const indexRows = spec.map(x => ({
    _id: x.id, name: '', phone: '', email: '', referralCode: '', referredByCode: '',
    tuitionStatus: 'paid', status: 'active', courseTitles: [], classIds: [], start: '',
    hasAccount: false, packageCount: x.dates.length, regDates: x.dates,
  }));
  const fullRows = spec.map(x => ({
    _id: x.id, status: 'active', summary: { tuitionStatus: 'paid' }, enrollments: [],
    packages: x.dates.map(d => ({ registeredAt: d })),
  }));
  for (const q of [{ packages: '2' }, { packages: '2+' }, { packages: '1' },
                   { registeredAt: '2026-03-21' }, { registeredAt: '2026-05-02' },
                   { packages: '2+', registeredAt: '2026-05-02' }]) {
    assert.deepEqual(
      filterIndexRows(indexRows, q).map(r => r._id),
      applyDerivedFilters(fullRows, q).map(r => r._id),
      `lệch ở ${JSON.stringify(q)}`,
    );
  }
});
