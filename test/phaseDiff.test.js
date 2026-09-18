const test = require('node:test');
const assert = require('node:assert/strict');
const { diffPhases } = require('../src/utils/phaseDiff');

// Lớp học T3 hằng tuần, 04/08 → 25/08/2026. Ngày T3: 04, 11, 18, 25.
const cls = {
  _id: 'C1', name: 'VIP01', ratePerSession: 200000,
  course: 'A', days: 'T3', time: '13:00', startDate: '2026-08-04', endDate: '2026-08-25',
  phases: [{ courseTitle: 'A', days: 'T3', time: '13:00', fromDate: '2026-08-04', toDate: '2026-08-25',
    teachers: [{ teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-04', toDate: '2026-08-25', rate: null }] }],
};
// Đổi T3 → T5: mọi ngày T3 biến mất, thay bằng T5 (06, 13, 20).
const nextPhases = [{ ...cls.phases[0], days: 'T5' }];
const run = extra => diffPhases({ cls, nextPhases, sessions: [], attendances: [], payments: [], today: '2026-10-01', ...extra });

test('liệt kê đúng ngày mất đi và ngày thêm vào', () => {
  const d = run();
  assert.deepEqual(d.lostDates, ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25']);
  assert.deepEqual(d.gainedDates, ['2026-08-06', '2026-08-13', '2026-08-20']);
});

test('bản ghi nằm trên ngày biến mất được liệt kê kèm gợi ý ngày thay thế', () => {
  const sessions = [{ _id: 'S1', classId: 'C1', date: '2026-08-11', status: 'taught', teacherName: 'CÔ A' }];
  const d = run({ sessions });
  assert.equal(d.orphans.length, 1);
  assert.equal(d.orphans[0].id, 'S1');
  assert.equal(d.orphans[0].kind, 'session');
  assert.ok(d.orphans[0].suggestions.includes('2026-08-13'), 'gợi ý ngày trong lịch mới');
  assert.equal(d.orphans[0].suggestions[0], '2026-08-13', 'ngày gần ngày gốc nhất đứng đầu');
});

test('ngày đã có buổi khác không được gợi ý (unique index classId+date)', () => {
  const sessions = [
    { _id: 'S1', classId: 'C1', date: '2026-08-11', status: 'taught', teacherName: 'CÔ A' },
    { _id: 'S2', classId: 'C1', date: '2026-08-13', status: 'taught', teacherName: 'CÔ A' },
  ];
  const d = run({ sessions });
  const o = d.orphans.find(x => x.id === 'S1');
  assert.ok(!o.suggestions.includes('2026-08-13'), 'ngày 13/08 đã có buổi S2, không được gợi ý');
});

test('điểm danh buổi bù trỏ vào ngày còn trong lịch mới thì KHÔNG phải xử lý', () => {
  const attendances = [
    { _id: 'A1', classId: 'C1', date: '2026-08-12', replacesDate: '2026-08-06' },
    { _id: 'A2', classId: 'C1', date: '2026-08-14', replacesDate: '2026-08-11' },
  ];
  const d = run({ attendances });
  assert.deepEqual(d.orphans.map(o => o.id), ['A2'], 'A1 bù cho 06/08 vẫn nằm trong lịch mới');
});

test('kỳ lương bị chạm được nêu kèm chênh lệch và cờ đã trả', () => {
  const payments = [{ _id: 'P1', teacherId: 'T1', periodStart: '2026-08-10', amountPaid: 800000, verified: true }];
  const d = run({ payments });
  const p = d.periods.find(x => x.label === '2026-08');
  assert.ok(p, 'kỳ 2026-08 phải nằm trong danh sách bị chạm');
  assert.equal(p.paid, true);
  assert.equal(p.verified, true);
  assert.notEqual(p.diff, 0, 'đổi T3 sang T5 làm số buổi trong kỳ đổi');
});

test('không đổi gì thì không có ngày mất, không bản ghi cần xử lý, không kỳ bị chạm', () => {
  const d = diffPhases({ cls, nextPhases: cls.phases, sessions: [{ _id: 'S1', classId: 'C1', date: '2026-08-11', status: 'taught' }],
    attendances: [], payments: [], today: '2026-10-01' });
  assert.deepEqual(d.lostDates, []);
  assert.deepEqual(d.orphans, []);
  assert.deepEqual(d.periods, []);
});

test('xoá hẳn một khoá: mọi ngày của khoá đó đều mất và không còn gợi ý nào', () => {
  const two = {
    ...cls,
    phases: [
      { courseTitle: 'A', days: 'T3', time: '', fromDate: '2026-08-04', toDate: '2026-08-25', teachers: [] },
      { courseTitle: 'B', days: 'T5', time: '', fromDate: '2026-09-01', toDate: '2026-09-30', teachers: [] },
    ],
  };
  const d = diffPhases({ cls: two, nextPhases: [two.phases[1]],
    sessions: [{ _id: 'S1', classId: 'C1', date: '2026-08-11', status: 'taught' }],
    attendances: [], payments: [], today: '2026-10-01' });
  assert.ok(d.lostDates.includes('2026-08-11'));
  assert.equal(d.orphans.length, 1);
  // Gợi ý là mọi ngày CÒN TRỐNG trong lịch mới, không giới hạn ở ngày mới thêm — nếu giới
  // hạn, rút ngắn khoá sẽ làm admin chỉ còn mỗi lựa chọn xoá một buổi đã dạy thật.
  assert.ok(d.orphans[0].suggestions.length > 0, 'phải gợi ý được ngày trong khoá còn lại');
  assert.ok(d.orphans[0].suggestions.every(x => x >= '2026-09-01'), 'toàn ngày của khoá B');
});
