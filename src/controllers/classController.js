const Class = require('../models/Class');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  const classes = await Class.find(filter).sort({ startDate: -1 });
  success(res, classes);
};

exports.getOne = async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, cls);
};

exports.create = async (req, res) => {
  const cls = await Class.create(req.body);
  success(res, cls, 'Tạo lớp học thành công', 201);
};

exports.update = async (req, res, next) => {
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, cls, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const cls = await Class.findByIdAndDelete(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, null, 'Xóa thành công');
};
