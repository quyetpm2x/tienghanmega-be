const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidClassDate } = require('../src/utils/classDate');

// T3 hằng tuần, 04/08 → 25/08/2026. Các ngày T3: 04, 11, 18, 25.
const cls = { days: 'T3', startDate: '2026-08-04', endDate: '2026-08-25', course: 'A', time: '13:00' };

test('buổi dạy đúng ngày trong lịch: hợp lệ', () => {
  assert.equal(isValidClassDate(cls, { date: '2026-08-11' }, 'session'), true);
});

test('buổi dạy ngoài lịch: KHÔNG hợp lệ', () => {
  assert.equal(isValidClassDate(cls, { date: '2026-08-12' }, 'session'), false);
  assert.equal(isValidClassDate(cls, { date: '2026-09-01' }, 'session'), false, 'ngoài khoảng ngày của lớp');
});

test('điểm danh ngoài lịch nhưng là buổi bù hợp lệ: hợp lệ', () => {
  assert.equal(isValidClassDate(cls, { date: '2026-08-13', replacesDate: '2026-08-11' }, 'attendance'), true);
});

test('điểm danh buổi bù trỏ vào ngày KHÔNG có trong lịch: không hợp lệ', () => {
  assert.equal(isValidClassDate(cls, { date: '2026-08-13', replacesDate: '2026-08-12' }, 'attendance'), false);
});

test('buổi dạy KHÔNG có ngoại lệ buổi bù — replacesDate không cứu được', () => {
  assert.equal(isValidClassDate(cls, { date: '2026-08-13', replacesDate: '2026-08-11' }, 'session'), false);
});

test('lớp nhiều khoá: lịch riêng từng khoá đều hợp lệ', () => {
  const c = { ...cls, phases: [
    { courseTitle: 'A', days: 'T3', time: '13:00', fromDate: '2026-08-04', toDate: '2026-08-11' },
    { courseTitle: 'B', days: 'T6', time: '19:30', fromDate: '2026-08-14', toDate: '2026-08-28' },
  ] };
  assert.equal(isValidClassDate(c, { date: '2026-08-11' }, 'session'), true, 'T3 của khoá A');
  assert.equal(isValidClassDate(c, { date: '2026-08-21' }, 'session'), true, 'T6 của khoá B');
  assert.equal(isValidClassDate(c, { date: '2026-08-18' }, 'session'), false, 'T3 nhưng đã sang khoá B');
});

test('lớp còn mở (endDate rỗng): ngày tương lai đúng thứ vẫn hợp lệ', () => {
  const c = { days: 'T3', startDate: '2026-08-04', endDate: '', course: 'A' };
  assert.equal(isValidClassDate(c, { date: '2027-05-04' }, 'session'), true, '04/05/2027 là T3');
  assert.equal(isValidClassDate(c, { date: '2027-05-05' }, 'session'), false, 'T4 thì không');
});

test('không có lớp hoặc không có ngày: không hợp lệ', () => {
  assert.equal(isValidClassDate(null, { date: '2026-08-11' }, 'session'), false);
  assert.equal(isValidClassDate(cls, {}, 'session'), false);
});
