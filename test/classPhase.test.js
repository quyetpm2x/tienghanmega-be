const test = require('node:test');
const assert = require('node:assert/strict');
const { effectivePhases, phaseAt, validatePhases, scheduledDatesOfClass } = require('../src/utils/classPhase');

const cls = (extra = {}) => ({
  course: 'TOPIK I', days: 'T3,T5', time: '13:00 - 15:00',
  startDate: '2026-07-21', endDate: '2026-09-10', ...extra,
});

test('lớp chưa có giai đoạn: coi như một giai đoạn suy từ chính lớp', () => {
  const p = effectivePhases(cls());
  assert.equal(p.length, 1);
  assert.deepEqual(
    { course: p[0].courseTitle, days: p[0].days, from: p[0].fromDate, to: p[0].toDate },
    { course: 'TOPIK I', days: 'T3,T5', from: '2026-07-21', to: '2026-09-10' },
  );
});

test('phaseAt trả giai đoạn chứa ngày đó, ngoài mọi giai đoạn thì null', () => {
  const c = cls({ phases: [
    { courseTitle: 'TOPIK I', days: 'T3,T5', time: '13:00 - 15:00', fromDate: '2026-07-21', toDate: '2026-09-10' },
    { courseTitle: 'GIAO TIẾP', days: 'T2,T4,T6', time: '19:30 - 21:30', fromDate: '2026-09-15', toDate: null },
  ] });
  assert.equal(phaseAt(c, '2026-08-01')?.courseTitle, 'TOPIK I');
  assert.equal(phaseAt(c, '2026-09-20')?.courseTitle, 'GIAO TIẾP');
  assert.equal(phaseAt(c, '2026-09-12'), null, 'ngày nghỉ giữa 2 khoá');
});

test('sinh buổi dạy theo lịch RIÊNG của từng giai đoạn', () => {
  const c = cls({ phases: [
    // T3, T5 trong tuần 21/07–31/07
    { courseTitle: 'A', days: 'T3,T5', time: '13:00', fromDate: '2026-07-21', toDate: '2026-07-31' },
    // T2, T4 trong tuần 03/08–10/08
    { courseTitle: 'B', days: 'T2,T4', time: '19:30', fromDate: '2026-08-03', toDate: '2026-08-10' },
  ] });
  const dates = scheduledDatesOfClass(c, '2026-12-31');
  assert.deepEqual(dates, [
    '2026-07-21', '2026-07-23', '2026-07-28', '2026-07-30',   // T3/T5
    '2026-08-03', '2026-08-05', '2026-08-10',                 // T2/T4
  ]);
});

test('giai đoạn còn mở lấy tới ngày chốt truyền vào', () => {
  const c = cls({ phases: [{ courseTitle: 'A', days: 'T2', time: '', fromDate: '2026-09-07', toDate: null }] });
  assert.deepEqual(scheduledDatesOfClass(c, '2026-09-21'), ['2026-09-07', '2026-09-14', '2026-09-21']);
});

test('lớp cũ (không có phases) sinh buổi y như trước', () => {
  const c = cls({ startDate: '2026-09-01', endDate: '2026-09-10', days: 'T3,T5' });
  assert.deepEqual(scheduledDatesOfClass(c, '2026-12-31'), ['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10']);
});

test('chặn hai giai đoạn chồng ngày', () => {
  assert.throws(() => validatePhases([
    { courseTitle: 'A', fromDate: '2026-07-01', toDate: '2026-08-31', days: 'T2' },
    { courseTitle: 'B', fromDate: '2026-08-15', toDate: null, days: 'T3' },
  ]), /chồng/i);
});

test('kiểm tra dữ liệu giai đoạn: thiếu khoá, thiếu ngày bắt đầu, ngày kết thúc sai', () => {
  assert.throws(() => validatePhases([{ fromDate: '2026-07-01', days: 'T2' }]), /khoá học/i);
  assert.throws(() => validatePhases([{ courseTitle: 'A', days: 'T2' }]), /ngày bắt đầu/i);
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '2026-08-10', toDate: '2026-08-01', days: 'T2' }]), /kết thúc/i);
  assert.throws(() => validatePhases([{ courseTitle: 'A', fromDate: '2026-08-01', days: '' }]), /thứ học/i);
});
