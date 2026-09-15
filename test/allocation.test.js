const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate } = require('../src/utils/allocation');

test('chia giảm 1M theo giá 3M/3M/2M', () => {
  assert.deepEqual(allocate(1000000, [3000000, 3000000, 2000000]), [375000, 375000, 250000]);
});

test('phần dư vào phần thập phân lớn nhất, hoà thì ưu tiên phần tử sau', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [33, 33, 34]);
  assert.deepEqual(allocate(10, [1, 2]), [3, 7]);
});

test('tổng luôn khít với total', () => {
  const cases = [[7, [3, 3, 3]], [999999, [1, 7, 13, 29]], [1, [5, 5, 5, 5]]];
  for (const [total, w] of cases) {
    assert.equal(allocate(total, w).reduce((a, b) => a + b, 0), total);
  }
});

test('không phần nào vượt trọng số khi total không vượt tổng trọng số', () => {
  const w = [1000000, 1000000, 6000000];
  for (const total of [0, 1, 3000000, 7999999, 8000000]) {
    allocate(total, w).forEach((v, i) => assert.ok(v >= 0 && v <= w[i], `total=${total} i=${i} v=${v}`));
  }
});

test('trường hợp rỗng hoặc bằng 0', () => {
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.deepEqual(allocate(100, [0, 0]), [0, 0]);
  assert.deepEqual(allocate(100, []), []);
});

test('từ chối đầu vào không hợp lệ', () => {
  assert.throws(() => allocate(-1, [1]), RangeError);
  assert.throws(() => allocate(1.5, [1]), RangeError);
  assert.throws(() => allocate(10, [-1, 2]), RangeError);
  assert.throws(() => allocate(10, 'abc'), RangeError);
});
