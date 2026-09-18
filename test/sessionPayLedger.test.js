const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTeacherLedger } = require('../src/utils/teacherLedger');

// Lớp học T3 hằng tuần, 04/08 → 25/08/2026. Các ngày T3: 04, 11, 18, 25.
const classFixture = {
  _id: 'C1', name: 'VIP01', ratePerSession: 200000,
  course: 'TOPIK I', days: 'T3', time: '13:00 - 15:00',
  startDate: '2026-08-04', endDate: '2026-08-25',
  teacherId: 'T1', teacher: 'CÔ A',
  teacherAssignments: [{ teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-08-04', toDate: null }],
  rateHistory: [],
};
const ledgerFor = (teacherId, overrides) => buildTeacherLedger({
  teacherId, classes: [classFixture], overrides,
  bonuses: [], commissions: [], todayStr: '2026-10-01',
});
const sessionsOf = items => items.filter(i => i.kind === 'session');

test('buổi dời lịch CŨ (không payDate) vẫn tính vào kỳ của ngày gốc', () => {
  const items = ledgerFor('T1', [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'rescheduled', rescheduledDate: '2026-09-22' }]);
  assert.ok(sessionsOf(items).find(i => i.date === '2026-08-11'), 'buổi dời lịch cũ phải nằm ở ngày gốc');
  assert.equal(sessionsOf(items).filter(i => i.date === '2026-09-22').length, 0, 'KHÔNG được nhảy sang ngày bù');
  assert.equal(sessionsOf(items).length, 4, 'vẫn đủ 4 buổi T3');
});

test('buổi dời lịch MỚI (có payDate) tính vào kỳ của ngày dạy thật', () => {
  const items = ledgerFor('T1', [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'rescheduled', rescheduledDate: '2026-09-22', payDate: '2026-09-22' }]);
  assert.equal(sessionsOf(items).filter(i => i.date === '2026-08-11').length, 0);
  assert.ok(sessionsOf(items).find(i => i.date === '2026-09-22'), 'phải chuyển sang ngày dạy thật');
  assert.equal(sessionsOf(items).length, 4, 'vẫn đủ 4 buổi, không mất không thêm');
});

test('paidTeacherId chuyển buổi sang giảng viên khác, kèm lương riêng', () => {
  const overrides = [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'rescheduled', rescheduledDate: '2026-09-22', payDate: '2026-09-22',
    paidTeacherId: 'T9', paidTeacherName: 'CÔ X', paidRate: 250000 }];
  const t1 = sessionsOf(ledgerFor('T1', overrides));
  assert.equal(t1.length, 3, 'T1 chỉ còn 3 buổi');
  assert.equal(t1.filter(i => i.date === '2026-08-11' || i.date === '2026-09-22').length, 0);

  const t9 = sessionsOf(ledgerFor('T9', overrides));
  assert.equal(t9.length, 1);
  assert.equal(t9[0].date, '2026-09-22', 'tính vào kỳ của ngày dạy thật');
  assert.equal(t9[0].amount, 250000, 'dùng lương riêng của buổi');
});

test('paidTeacherId gán buổi cho giảng viên ĐANG phụ trách: không bị mất, không đếm đôi', () => {
  const overrides = [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'substituted', substituteTeacherId: 'T1', substituteTeacherName: 'CÔ A' }];
  const t1 = sessionsOf(ledgerFor('T1', overrides));
  assert.equal(t1.length, 4, 'vẫn đủ 4 buổi — không được rơi mất vì status substituted');
  assert.equal(t1.filter(i => i.date === '2026-08-11').length, 1, 'đúng một lần, không đếm đôi');
});

test('buổi dạy thay CŨ vẫn chạy y hệt: trừ người gốc, cộng người dạy thay', () => {
  const overrides = [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'substituted', substituteTeacherId: 'T9', substituteTeacherName: 'CÔ X', substituteRate: 250000 }];
  assert.equal(sessionsOf(ledgerFor('T1', overrides)).length, 3, 'người gốc mất buổi đó');
  const t9 = sessionsOf(ledgerFor('T9', overrides));
  assert.equal(t9.length, 1);
  assert.equal(t9[0].amount, 250000);
  assert.equal(t9[0].date, '2026-08-11', 'dạy thay không dời ngày');
});

test("'absent' và 'not-taught' không sinh tiền cho ai", () => {
  const overrides = [
    { _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11', status: 'absent' },
    { _id: 'S2', classId: 'C1', className: 'VIP01', date: '2026-08-18', status: 'not-taught' },
  ];
  assert.equal(sessionsOf(ledgerFor('T1', overrides)).length, 2, 'chỉ còn 04/08 và 25/08');
});

test('lớp không override: đủ 4 buổi, đúng đơn giá mặc định', () => {
  const items = sessionsOf(ledgerFor('T1', []));
  assert.equal(items.length, 4);
  assert.deepEqual(items.map(i => i.date), ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25']);
  assert.ok(items.every(i => i.amount === 200000));
});

test("'absent' thắng cả paidTeacherId: đúng một dòng, không sinh tiền", () => {
  const overrides = [{ _id: 'S1', classId: 'C1', className: 'VIP01', date: '2026-08-11',
    status: 'absent', paidTeacherId: 'T1', paidTeacherName: 'CÔ A' }];
  const items = ledgerFor('T1', overrides);
  assert.equal(sessionsOf(items).length, 3, 'buổi nghỉ không được trả tiền');
  assert.equal(sessionsOf(items).filter(i => i.date === '2026-08-11').length, 0,
    'và tuyệt đối không được sinh thêm một dòng "đã dạy" cho chính ngày đó');
});

test("'not-taught' cũng vậy", () => {
  const overrides = [{ _id: 'S2', classId: 'C1', className: 'VIP01', date: '2026-08-18',
    status: 'not-taught', paidTeacherId: 'T1' }];
  assert.equal(sessionsOf(ledgerFor('T1', overrides)).length, 3);
});
