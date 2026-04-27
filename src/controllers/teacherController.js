const Teacher = require('../models/Teacher');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const teachers = await Teacher.find({ isActive: true });
  success(res, teachers);
};

exports.getOne = async (req, res, next) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  success(res, teacher);
};

exports.create = async (req, res) => {
  const teacher = await Teacher.create(req.body);
  success(res, teacher, 'Tạo giảng viên thành công', 201);
};

exports.update = async (req, res, next) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  success(res, teacher, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  success(res, null, 'Xóa thành công');
};
