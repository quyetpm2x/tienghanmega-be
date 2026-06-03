const Level = require('../models/Level');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getPublic = async (req, res) => {
  const levels = await Level.find({ active: true }).sort({ order: 1, createdAt: 1 });
  success(res, levels);
};

exports.getAll = async (req, res) => {
  const levels = await Level.find().sort({ order: 1, createdAt: 1 });
  success(res, levels);
};

exports.create = async (req, res) => {
  const level = await Level.create(req.body);
  success(res, level, 'Thêm trình độ thành công', 201);
};

exports.update = async (req, res, next) => {
  const level = await Level.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!level) return next(new AppError('Không tìm thấy trình độ', 404));
  success(res, level, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const level = await Level.findByIdAndDelete(req.params.id);
  if (!level) return next(new AppError('Không tìm thấy trình độ', 404));
  success(res, null, 'Xóa thành công');
};

exports.reorder = async (req, res) => {
  await Promise.all(req.body.map(({ id, order }) => Level.findByIdAndUpdate(id, { order })));
  success(res, null, 'Cập nhật thứ tự thành công');
};
