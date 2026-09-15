const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const EnrollmentPackage = require('../src/models/EnrollmentPackage');
const Enrollment = require('../src/models/Enrollment');
const Payment = require('../src/models/Payment');
const Student = require('../src/models/Student');

const oid = () => new mongoose.Types.ObjectId();

test('EnrollmentPackage hợp lệ và mặc định', () => {
  const p = new EnrollmentPackage({ studentId: oid(), listTotal: 8000000, discount: 1000000, netTotal: 7000000 });
  assert.equal(p.validateSync(), undefined);
  assert.equal(p.discountAllocation, 'auto');
  assert.equal(p.paidAdjustment, 0);
  assert.equal(p.migratedAt, null);
});

test('EnrollmentPackage cho phép paidAdjustment âm nhưng chặn tiền âm', () => {
  assert.equal(new EnrollmentPackage({ studentId: oid(), listTotal: 1, netTotal: 1, paidAdjustment: -5 }).validateSync(), undefined);
  assert.ok(new EnrollmentPackage({ studentId: oid(), listTotal: -1, netTotal: 0 }).validateSync());
  assert.ok(new EnrollmentPackage({ listTotal: 1, netTotal: 1 }).validateSync(), 'thiếu studentId phải lỗi');
});

test('Enrollment hợp lệ, classId không bắt buộc', () => {
  const e = new Enrollment({ studentId: oid(), packageId: oid(), listPrice: 100, netPrice: 100, courseCategory: 'bundle' });
  assert.equal(e.validateSync(), undefined);
  assert.equal(e.status, 'active');
  assert.equal(e.discountShare, 0);
});

test('Enrollment chặn trạng thái và loại khoá lạ', () => {
  assert.ok(new Enrollment({ studentId: oid(), packageId: oid(), listPrice: 1, netPrice: 1, status: 'weird' }).validateSync());
  assert.ok(new Enrollment({ studentId: oid(), packageId: oid(), listPrice: 1, netPrice: 1, courseCategory: 'x' }).validateSync());
});

test('Payment nhận packageId và loại bundle', () => {
  const p = new Payment({ studentId: oid(), packageId: oid(), amount: 1000, courseCategory: 'bundle' });
  assert.equal(p.validateSync(), undefined);
});

test('Student có statusManual mặc định false', () => {
  assert.equal(new Student({ name: 'A' }).statusManual, false);
});
