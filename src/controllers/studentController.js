const Student = require('../models/Student');
const Payment = require('../models/Payment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

function getCourseCategory(level) {
  if (!level) return 'conversation';
  const l = level.toLowerCase();
  if (l.includes('sơ cấp') || l.includes('so cap')) return 'beginner';
  if (l.includes('trung cấp') || l.includes('trung cap')) return 'intermediate';
  if (l.includes('topik') || l.includes('lộ trình') || l.includes('lo trinh')) return 'topik';
  return 'conversation';
}

exports.getAll = async (req, res) => {
  const { className, tuitionStatus } = req.query;
  const filter = {};
  if (className) filter.className = className;
  if (tuitionStatus) filter.tuitionStatus = tuitionStatus;
  const students = await Student.find(filter).sort({ createdAt: -1 });
  success(res, students);
};

exports.getOne = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  success(res, student);
};

exports.create = async (req, res) => {
  const student = await Student.create(req.body);
  success(res, student, 'Thêm học viên thành công', 201);
};

exports.update = async (req, res, next) => {
  const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  success(res, student, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  success(res, null, 'Xóa thành công');
};

exports.transfer = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  const { classId, className, level } = req.body;
  if (!className) return next(new AppError('Thiếu thông tin lớp mới', 400));

  student.transferHistory = student.transferHistory || [];
  student.transferHistory.push({
    classId: student.classId,
    className: student.className,
    level: student.level,
    transferredAt: new Date(),
  });
  student.classId = classId;
  student.className = className;
  student.level = level;
  await student.save();
  success(res, student, 'Chuyển lớp thành công');
};

// GET /admin/students/:id/payments
exports.getPayments = async (req, res, next) => {
  const student = await Student.findById(req.params.id).select('_id');
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  const payments = await Payment.find({ studentId: req.params.id }).sort({ paidAt: -1 });
  success(res, payments);
};

// POST /admin/students/:id/payments
exports.addPayment = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));

  const { amount, paidAt, note } = req.body;
  if (!amount || Number(amount) <= 0) return next(new AppError('Số tiền không hợp lệ', 400));

  const payment = await Payment.create({
    studentId:      student._id,
    studentName:    student.name,
    classId:        student.classId,
    className:      student.className,
    courseCategory: getCourseCategory(student.level),
    amount:         Number(amount),
    paidAt:         paidAt ? new Date(paidAt) : new Date(),
    note:           note || '',
  });

  student.amount = (student.amount || 0) + Number(amount);
  if ((student.coursePrice || 0) > 0) {
    if (student.amount >= student.coursePrice) student.tuitionStatus = 'paid';
    else student.tuitionStatus = 'partial';
  } else {
    student.tuitionStatus = 'partial';
  }
  await student.save();

  success(res, { payment, student }, 'Ghi nhận thanh toán thành công');
};
