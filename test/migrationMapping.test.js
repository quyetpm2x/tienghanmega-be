const test = require('node:test');
const assert = require('node:assert/strict');
const {
  legacyContract, buildMigrationPlan, checkPlan, legacyMonthly, planMonthly, compareMonthly, explainDelta,
} = require('../src/utils/migrationMapping');

const C1 = { _id: 'c1', name: 'LỘ TRÌNH T06', course: 'Lộ trình' };
const C2 = { _id: 'c2', name: 'TOPIK 3,4', course: 'TOPIK II CẤP 3,4' };

function fixture() {
  const students = [
    { _id: 's1', name: 'A', classId: 'c1', className: 'LỘ TRÌNH T06', level: 'Lộ trình', startDate: '2026-09-02', status: 'active', coursePrice: 2990000, amount: 2990000, amountHistory: [{ from: 0, to: 2990000, changedBy: 'Admin' }] },
    { _id: 's2', name: 'B', classId: null, className: 'TOPIK 3,4', level: 'TOPIK II', startDate: '2026-09-05', status: 'active', coursePrice: 0, amount: 1500000 },
    { _id: 's3', name: 'C', classId: 'c1', className: 'Tên cũ', level: 'Lộ trình', startDate: '2026-08-10', status: 'dropped', coursePrice: 2000000, amount: 500000 },
    { _id: 's4', name: 'D', classId: 'cX', className: 'Lớp đã xoá', level: '', startDate: '2026-09-01', status: 'active', coursePrice: 1000000, amount: 300000 },
  ];
  const payments = [
    { _id: 'p1', studentId: 's1', amount: 1000000, paidAt: '2026-09-03T02:00:00Z' },
    { _id: 'p2', studentId: 's1', amount: 2500000, paidAt: '2026-10-01T02:00:00Z' },
    { _id: 'p3', studentId: 's3', amount: 500000, paidAt: '2026-08-11T02:00:00Z' },
    { _id: 'p9', studentId: 'ghost', amount: 700000, paidAt: '2026-09-09T02:00:00Z' },
  ];
  return { students, payments, classes: [C1, C2] };
}

test('học phí cũ: coursePrice, rơi về amount khi bằng 0', () => {
  assert.equal(legacyContract({ coursePrice: 2990000, amount: 1 }), 2990000);
  assert.equal(legacyContract({ coursePrice: 0, amount: 1500000 }), 1500000);
  assert.equal(legacyContract({}), 0);
});

test('ánh xạ gói, ghi danh, điều chỉnh và lớp', () => {
  const plan = buildMigrationPlan(fixture());
  assert.equal(plan.items.length, 4);
  const [a, b, c, d] = plan.items;

  assert.equal(a.package.netTotal, 2990000);
  assert.equal(a.package.discount, 0);
  assert.equal(a.package.paidAdjustment, 2990000 - 3500000);
  assert.deepEqual(a.paymentIds, ['p1', 'p2']);
  assert.equal(a.package.adjustmentHistory.length, 1);
  assert.equal(a.enrollment.classId, 'c1');
  assert.equal(a.enrollment.courseCategory, 'bundle');
  assert.ok(a.warnings.some(w => w.includes('lớn hơn số đã nộp')));

  assert.equal(b.package.netTotal, 1500000);
  assert.equal(b.enrollment.classId, 'c2', 'tra lớp theo tên khi classId trống');
  assert.equal(b.package.paidAdjustment, 1500000);

  assert.equal(c.enrollment.status, 'dropped');
  assert.equal(c.enrollment.className, 'LỘ TRÌNH T06', 'tên lớp đọc lại từ Class');
  assert.ok(c.warnings.some(w => w.includes('Tên cũ')));

  assert.equal(d.enrollment.classId, null);
  assert.equal(d.enrollment.status, 'unassigned', 'đang học nhưng không còn lớp → chưa xếp lớp');
  assert.ok(d.warnings.some(w => w.includes('không còn tồn tại')));
  assert.equal(d.package.legacy.amount, 300000);

  assert.deepEqual(plan.orphanPayments.map(p => p._id), ['p9']);
});

test('bỏ qua học sinh đã có gói', () => {
  const plan = buildMigrationPlan({ ...fixture(), skipStudentIds: ['s2'] });
  assert.equal(plan.items.length, 3);
  assert.deepEqual(plan.skipped.map(s => s.studentId), ['s2']);
});

test('bất biến đạt trên kế hoạch đúng', () => {
  const f = fixture();
  const checks = checkPlan(buildMigrationPlan(f), f);
  assert.ok(checks.length >= 5);
  assert.deepEqual(checks.filter(c => !c.ok), []);
});

test('bất biến bắt được kế hoạch sai', () => {
  const f = fixture();
  const plan = buildMigrationPlan(f);
  plan.items[0].package.paidAdjustment += 1;
  assert.ok(checkPlan(plan, f).some(c => !c.ok));
});

test('doanh thu: học sinh đang học giống hệt, chênh lệch chỉ ở học sinh đã nghỉ', () => {
  const f = fixture();
  const legacy = legacyMonthly(f.students, f.payments);
  const fresh = planMonthly(buildMigrationPlan(f), f.payments);
  assert.equal(legacy['2026-09'].revenue, fresh['2026-09'].revenue);
  assert.equal(legacy['2026-09'].collected, fresh['2026-09'].collected);
  assert.equal(legacy['2026-08'], undefined, 'quy tắc cũ loại học sinh đã nghỉ');
  assert.equal(fresh['2026-08'].revenue, 2000000);

  const rows = compareMonthly(legacy, fresh);
  assert.deepEqual(rows.filter(r => r.diffRevenue !== 0).map(r => r.month), ['2026-08']);
  assert.deepEqual(explainDelta(f.students, f.payments).map(x => x.studentId), ['s3']);
});
