const TeacherSession = require('../models/TeacherSession');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const { teacherName, month } = req.query;
  const filter = {};
  if (teacherName) filter.teacherName = teacherName;
  if (month) filter.date = { $regex: `^${month}` }; // e.g. "2026-04"
  const sessions = await TeacherSession.find(filter).sort({ date: -1 });
  success(res, sessions);
};

exports.create = async (req, res) => {
  const session = await TeacherSession.create(req.body);
  success(res, session, 'Ghi nhận buổi dạy thành công', 201);
};

exports.update = async (req, res, next) => {
  const session = await TeacherSession.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!session) return next(new AppError('Không tìm thấy buổi dạy', 404));
  success(res, session, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const session = await TeacherSession.findByIdAndDelete(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy buổi dạy', 404));
  success(res, null, 'Xóa thành công');
};
