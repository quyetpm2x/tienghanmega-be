const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeText, matchesQuery } = require('../src/utils/textSearch');

test('bỏ dấu tiếng Việt, đ → d, không phân biệt hoa thường, gộp khoảng trắng', () => {
  assert.equal(normalizeText('  Đặng Thị   Bích NGỌC '), 'dang thi bich ngoc');
});

test('tìm có dấu hoặc không dấu đều ra; chuỗi rỗng khớp tất cả', () => {
  assert.equal(matchesQuery('Thảo Phương', 'thao phuong'), true);
  assert.equal(matchesQuery('Thảo Phương', 'Phương'), true);
  assert.equal(matchesQuery('Thảo Phương', 'linh'), false);
  assert.equal(matchesQuery('Ánh Vi', ''), true);
  assert.equal(matchesQuery('Ánh Vi', undefined), true);
});
