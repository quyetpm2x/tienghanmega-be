const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryOf, COURSE_CATEGORIES } = require('../src/utils/courseCategory');

test('giữ nguyên quy tắc đang dùng ở báo cáo doanh thu', () => {
  assert.equal(categoryOf('LỘ TRÌNH T06'), 'bundle');
  assert.equal(categoryOf('Combo 3 khoá'), 'bundle');
  assert.equal(categoryOf('Sơ Cấp 1'), 'beginner');
  assert.equal(categoryOf('so cap 2'), 'beginner');
  assert.equal(categoryOf('Trung Cấp 3'), 'intermediate');
  assert.equal(categoryOf('TOPIK II CẤP 3,4'), 'topik');
  assert.equal(categoryOf('Giao Tiếp Cơ Bản'), 'conversation');
});

test('lộ trình ưu tiên hơn topik (một khoá "Lộ trình TOPIK" là gói)', () => {
  assert.equal(categoryOf('Lộ trình TOPIK'), 'bundle');
});

test('rỗng thì là conversation', () => {
  assert.equal(categoryOf(''), 'conversation');
  assert.equal(categoryOf(undefined), 'conversation');
});

test('danh sách loại khớp enum model', () => {
  assert.deepEqual(COURSE_CATEGORIES, ['beginner', 'intermediate', 'topik', 'conversation', 'bundle']);
});
