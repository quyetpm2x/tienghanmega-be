const mongoose = require('mongoose');
const { COURSE_CATEGORIES } = require('../utils/courseCategory');

// Cùng enum với Student.status. 'unassigned' = đã đăng ký khoá nhưng chưa xếp lớp (học sau).
const ENROLLMENT_STATUSES = ['active', 'unassigned', 'completed', 'reserved', 'transferred', 'dropped'];

// Học sinh học MỘT khoá trong một gói. Mọi chỗ cần "học sinh của lớp" hoặc "các lớp
// của học sinh" đều truy qua đây (utils/enrollment.js) và join bằng classId — tên lớp
// chỉ là bản sao hiển thị vì đổi tên lớp không cascade.
const enrollmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'EnrollmentPackage', required: true },
  // Khoá học đã đăng ký (null với dữ liệu chuyển đổi cũ — khi đó dựa vào courseTitle).
  courseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  // Không bắt buộc: học sinh có thể đăng ký trước, xếp lớp sau (và dữ liệu cũ chưa xếp lớp).
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
  className: { type: String, default: '' },
  courseTitle: { type: String, default: '' },
  courseCategory: { type: String, enum: COURSE_CATEGORIES, default: 'conversation' },
  listPrice:     { type: Number, required: true, min: 0 },
  discountShare: { type: Number, default: 0, min: 0 },
  netPrice:      { type: Number, required: true, min: 0 },
  startDate: { type: String, default: '' },
  status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active' },
  transferHistory: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    courseTitle: String,
    transferredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

enrollmentSchema.index({ studentId: 1, status: 1 });
enrollmentSchema.index({ classId: 1, status: 1 });
enrollmentSchema.index({ packageId: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
module.exports.ENROLLMENT_STATUSES = ENROLLMENT_STATUSES;
