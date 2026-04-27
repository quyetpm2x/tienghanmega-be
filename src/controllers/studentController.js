const Student = require('../models/Student');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

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
