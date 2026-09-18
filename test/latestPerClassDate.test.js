const test = require('node:test');
const assert = require('node:assert/strict');
const { latestPerClassDate } = require('../src/utils/teacherLedger');

const classes = [{ _id: 'C1', name: 'VIP01' }];
const rec = (id, updatedAt, status) => ({ _id: id, classId: 'C1', className: 'VIP01', date: '2026-08-11', updatedAt, status });

test('mốc sửa muộn hơn thì thắng, bất kể thứ tự mảng', () => {
  const older = rec('aaa', '2026-08-11T10:00:00Z', 'absent');
  const newer = rec('bbb', '2026-08-12T10:00:00Z', 'taught');
  assert.equal(latestPerClassDate([older, newer], classes)[0]._id, 'bbb');
  assert.equal(latestPerClassDate([newer, older], classes)[0]._id, 'bbb', 'đảo thứ tự vẫn vậy');
});

test('HOÀ mốc sửa: kết quả KHÔNG được phụ thuộc thứ tự mảng đầu vào', () => {
  // Bản ghi do script hàng loạt ghi thường cùng updatedAt.
  const a = rec('aaa111111111111111111111', '2026-08-11T10:00:00Z', 'absent');
  const b = rec('bbb222222222222222222222', '2026-08-11T10:00:00Z', 'taught');
  const win1 = latestPerClassDate([a, b], classes)[0]._id;
  const win2 = latestPerClassDate([b, a], classes)[0]._id;
  assert.equal(win1, win2, 'backend lấy không sort, frontend lấy đã sort — hai bên PHẢI ra cùng một bản');
  assert.equal(win1, 'bbb222222222222222222222', 'hoà thì _id lớn hơn thắng');
});

test('hoà mốc sửa với ba bản: vẫn xác định, thứ tự nào cũng ra cùng kết quả', () => {
  const xs = [
    rec('111111111111111111111111', '2026-08-11T10:00:00Z', 'taught'),
    rec('333333333333333333333333', '2026-08-11T10:00:00Z', 'absent'),
    rec('222222222222222222222222', '2026-08-11T10:00:00Z', 'rescheduled'),
  ];
  const winners = new Set();
  // mọi hoán vị
  for (const [i, j, k] of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    winners.add(latestPerClassDate([xs[i], xs[j], xs[k]], classes)[0]._id);
  }
  assert.equal(winners.size, 1, 'sáu hoán vị phải ra đúng một bản thắng');
  assert.equal([...winners][0], '333333333333333333333333');
});

test('bản ghi không có updatedAt thì suy mốc từ ObjectId, vẫn xác định', () => {
  // 68c00000... = thời điểm lớn hơn 68b00000...
  const older = { _id: '68b0000000000000000000aa', classId: 'C1', className: 'VIP01', date: '2026-08-11', status: 'absent' };
  const newer = { _id: '68c0000000000000000000bb', classId: 'C1', className: 'VIP01', date: '2026-08-11', status: 'taught' };
  assert.equal(latestPerClassDate([older, newer], classes)[0]._id, newer._id);
  assert.equal(latestPerClassDate([newer, older], classes)[0]._id, newer._id);
});

test('khác ngày hoặc khác lớp thì không gom chung nhóm', () => {
  const a = rec('aaa', '2026-08-11T10:00:00Z', 'taught');
  const b = { ...rec('bbb', '2026-08-11T10:00:00Z', 'taught'), date: '2026-08-12' };
  assert.equal(latestPerClassDate([a, b], classes).length, 2);
});
