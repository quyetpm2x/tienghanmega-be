const TeacherPayment = require('../models/TeacherPayment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const { teacherId, periodStart } = req.query;
  const filter = {};
  if (teacherId) filter.teacherId = teacherId;
  if (periodStart) filter.periodStart = periodStart;
  const payments = await TeacherPayment.find(filter).sort({ periodStart: -1 });
  success(res, payments);
};

// Đánh dấu đã trả — 1 giáo viên chỉ có 1 bản ghi cho mỗi chu kỳ (periodStart),
// gọi lại nhiều lần sẽ ghi đè (upsert) thay vì tạo bản ghi trùng.
exports.upsert = async (req, res, next) => {
  const { teacherId, periodStart, periodEnd, amountPaid, paidDate, note } = req.body;
  if (!teacherId || !periodStart || !periodEnd || amountPaid == null || !paidDate) {
    return next(new AppError('Thiếu thông tin bắt buộc', 400));
  }
  const payment = await TeacherPayment.findOneAndUpdate(
    { teacherId, periodStart },
    { teacherId, periodStart, periodEnd, amountPaid, paidDate, note: note || '' },
    { new: true, upsert: true }
  );
  success(res, payment, 'Đã ghi nhận thanh toán', 201);
};

exports.remove = async (req, res, next) => {
  const payment = await TeacherPayment.findByIdAndDelete(req.params.id);
  if (!payment) return next(new AppError('Không tìm thấy bản ghi thanh toán', 404));
  success(res, null, 'Đã huỷ đánh dấu thanh toán');
};
