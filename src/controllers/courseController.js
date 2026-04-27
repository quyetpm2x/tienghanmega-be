const Course = require('../models/Course');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const { cat } = req.query;
  const filter = { isActive: true };
  if (cat && cat !== 'all') filter.cat = cat;
  const courses = await Course.find(filter).sort({ slug: 1 });
  success(res, courses);
};

exports.getOne = async (req, res, next) => {
  const course = await Course.findOne({ slug: Number(req.params.id) });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  success(res, course);
};

exports.create = async (req, res) => {
  const course = await Course.create(req.body);
  success(res, course, 'Tạo khóa học thành công', 201);
};

exports.update = async (req, res, next) => {
  const course = await Course.findOneAndUpdate({ slug: Number(req.params.id) }, req.body, { new: true, runValidators: true });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  success(res, course, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const course = await Course.findOneAndUpdate({ slug: Number(req.params.id) }, { isActive: false }, { new: true });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  success(res, null, 'Xóa thành công');
};
