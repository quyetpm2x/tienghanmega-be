const test = require('node:test');
const assert = require('node:assert/strict');
const { rateAt, validateRateHistory } = require('../src/utils/classRate');

const cls = (rateHistory) => ({ ratePerSession: 200000, rateHistory });

test('không có lịch sử thì dùng mức mặc định của lớp', () => {
  assert.equal(rateAt(cls([]), '2026-09-15', 't1'), 200000);
  assert.equal(rateAt({ ratePerSession: 150000 }, '2026-09-15', 't1'), 150000);
});

test('trong khoảng thì lấy mức của khoảng, ngoài khoảng quay về mặc định', () => {
  const c = cls([{ rate: 300000, fromDate: '2026-09-01', toDate: '2026-09-30', teacherIds: [] }]);
  assert.equal(rateAt(c, '2026-08-31', 't1'), 200000);
  assert.equal(rateAt(c, '2026-09-01', 't1'), 300000, 'ngày đầu tính vào khoảng');
  assert.equal(rateAt(c, '2026-09-30', 't1'), 300000, 'ngày cuối tính vào khoảng');
  assert.equal(rateAt(c, '2026-10-01', 't1'), 200000);
});

test('để trống ngày kết thúc = áp dụng từ đó trở đi', () => {
  const c = cls([{ rate: 350000, fromDate: '2026-09-01', toDate: null, teacherIds: [] }]);
  assert.equal(rateAt(c, '2030-01-01', 't1'), 350000);
  assert.equal(rateAt(c, '2026-08-31', 't1'), 200000);
});

test('khoảng gán cho giảng viên cụ thể chỉ áp cho giảng viên đó', () => {
  const c = cls([{ rate: 400000, fromDate: '2026-09-01', toDate: null, teacherIds: ['t1'] }]);
  assert.equal(rateAt(c, '2026-09-10', 't1'), 400000);
  assert.equal(rateAt(c, '2026-09-10', 't2'), 200000, 'giảng viên khác không bị ảnh hưởng');
});

test('mức riêng của giảng viên thắng mức áp cho tất cả', () => {
  const c = cls([
    { rate: 300000, fromDate: '2026-09-01', toDate: null, teacherIds: [] },
    { rate: 420000, fromDate: '2026-09-01', toDate: null, teacherIds: ['t1'] },
  ]);
  assert.equal(rateAt(c, '2026-09-10', 't1'), 420000);
  assert.equal(rateAt(c, '2026-09-10', 't2'), 300000);
});

test('nhiều khoảng nối tiếp: lấy khoảng bắt đầu muộn nhất còn hiệu lực', () => {
  const c = cls([
    { rate: 250000, fromDate: '2026-01-01', toDate: null, teacherIds: [] },
    { rate: 320000, fromDate: '2026-06-01', toDate: null, teacherIds: [] },
  ]);
  assert.equal(rateAt(c, '2026-03-01', 't1'), 250000);
  assert.equal(rateAt(c, '2026-07-01', 't1'), 320000);
});

test('kiểm tra dữ liệu nhập: thiếu ngày bắt đầu, mức âm, ngày kết thúc trước ngày bắt đầu', () => {
  assert.throws(() => validateRateHistory([{ rate: 100000, toDate: '2026-09-30' }]), /ngày bắt đầu/i);
  assert.throws(() => validateRateHistory([{ rate: 0, fromDate: '2026-09-01' }]), /mức lương/i);
  assert.throws(() => validateRateHistory([{ rate: 100000, fromDate: '2026-09-30', toDate: '2026-09-01' }]), /kết thúc/i);
});

test('chặn hai khoảng chồng nhau cùng phạm vi giảng viên', () => {
  assert.throws(() => validateRateHistory([
    { rate: 300000, fromDate: '2026-09-01', toDate: '2026-09-30', teacherIds: [] },
    { rate: 310000, fromDate: '2026-09-15', toDate: null, teacherIds: [] },
  ]), /chồng/i);
  // khác giảng viên thì không sao
  assert.doesNotThrow(() => validateRateHistory([
    { rate: 300000, fromDate: '2026-09-01', toDate: null, teacherIds: ['t1'] },
    { rate: 310000, fromDate: '2026-09-01', toDate: null, teacherIds: ['t2'] },
  ]));
});
