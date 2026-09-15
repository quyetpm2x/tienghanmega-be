const test = require('node:test');
const assert = require('node:assert/strict');
const { belongsToClass, recordsOfClassesFilter } = require('../src/utils/classLink');

const cls = { _id: 'c1', name: 'MG140926' };

test('có classId thì chỉ so theo classId (tên lệch vẫn đúng lớp)', () => {
  assert.equal(belongsToClass({ classId: 'c1', className: 'MG190826' }, cls), true);
  assert.equal(belongsToClass({ classId: 'c2', className: 'MG140926' }, cls), false);
});

test('bản ghi cũ chưa có classId thì tạm so theo tên', () => {
  assert.equal(belongsToClass({ classId: null, className: 'MG140926' }, cls), true);
  assert.equal(belongsToClass({ className: 'MG190826' }, cls), false);
});

test('bộ lọc Mongo: classId thuộc danh sách, hoặc chưa có classId mà tên khớp', () => {
  assert.deepEqual(recordsOfClassesFilter([cls, { _id: 'c2', name: 'SC2' }]), {
    $or: [{ classId: { $in: ['c1', 'c2'] } }, { classId: null, className: { $in: ['MG140926', 'SC2'] } }],
  });
});
