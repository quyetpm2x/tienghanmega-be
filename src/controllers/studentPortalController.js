const Student = require('../models/Student');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Everything in this controller derives its scope from req.studentAccount
// (set by protectStudent) — a student only ever sees their own record.

// Whitelist — không trả về `note` (ghi chú nội bộ của admin/giáo viên về học
// sinh này, không phải thông tin dành cho học sinh tự xem).
const STUDENT_FIELDS = 'name phone email className classId level startDate status tuitionStatus amount coursePrice transferHistory';
const CLASS_FIELDS = 'name course teacher days time startDate endDate status color';

exports.getMe = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const student = await Student.findById(studentId).select(STUDENT_FIELDS).populate('classId', CLASS_FIELDS);
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));
  success(res, student);
};
