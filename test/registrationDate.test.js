const test = require('node:test');
const assert = require('node:assert/strict');
const { vnToday, normalizeRegisteredAt } = require('../src/utils/registrationDate');

test('bỏ trống → hôm nay theo giờ Việt Nam', () => {
  // 30/09 lúc 17:30 UTC đã là 00:30 ngày 01/10 giờ VN.
  const t = Date.parse('2026-09-30T17:30:00Z');
  assert.equal(vnToday(t), '2026-10-01');
  assert.equal(normalizeRegisteredAt('', t), '2026-10-01');
  assert.equal(normalizeRegisteredAt(null, t), '2026-10-01');
  assert.equal(normalizeRegisteredAt(undefined, t), '2026-10-01');
  // Còn 16:59 UTC thì vẫn là 30/09.
  assert.equal(vnToday(Date.parse('2026-09-30T16:59:59Z')), '2026-09-30');
});

test('có giá trị hợp lệ → giữ nguyên, kể cả ngày quá khứ (nhập bù)', () => {
  assert.equal(normalizeRegisteredAt('2026-07-01'), '2026-07-01');
  assert.equal(normalizeRegisteredAt('  2026-07-01  '), '2026-07-01');
});

test('sai định dạng → báo lỗi 400, KHÔNG tự đoán', () => {
  // Thà chặn còn hơn ghi nhầm ngày vào sổ doanh thu.
  for (const bad of ['01/07/2026', '2026-7-1', 'hôm nay', '2026-07-01T00:00:00Z']) {
    assert.throws(() => normalizeRegisteredAt(bad), /Ngày đăng ký phải có dạng YYYY-MM-DD/, bad);
  }
});
