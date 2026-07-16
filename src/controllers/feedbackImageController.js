const FeedbackImage = require('../models/FeedbackImage');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const MAX_IMAGES = 30;

// Public: dùng cho trang chủ, sắp theo order
exports.getPublic = async (req, res) => {
  const images = await FeedbackImage.find().sort({ order: 1, createdAt: 1 });
  success(res, images);
};

// Admin: tất cả
exports.getAll = async (req, res) => {
  const images = await FeedbackImage.find().sort({ order: 1, createdAt: 1 });
  success(res, images);
};

exports.create = async (req, res, next) => {
  const { image, name, course } = req.body;
  if (!image?.trim()) return next(new AppError('Vui lòng chọn ảnh phản hồi', 400));
  if (!name?.trim() || !course?.trim()) return next(new AppError('Vui lòng nhập đủ tên học viên và khoá học', 400));
  const count = await FeedbackImage.countDocuments();
  if (count >= MAX_IMAGES) return next(new AppError(`Đã đạt tối đa ${MAX_IMAGES} ảnh phản hồi`, 400));
  const img = await FeedbackImage.create({ image: image.trim(), name: name.trim(), course: course.trim(), order: count });
  success(res, img, 'Thêm ảnh thành công', 201);
};

exports.update = async (req, res, next) => {
  const { image, name, course } = req.body;
  if (!image?.trim()) return next(new AppError('Vui lòng chọn ảnh phản hồi', 400));
  if (!name?.trim() || !course?.trim()) return next(new AppError('Vui lòng nhập đủ tên học viên và khoá học', 400));
  const img = await FeedbackImage.findByIdAndUpdate(
    req.params.id,
    { image: image.trim(), name: name.trim(), course: course.trim() },
    { new: true, runValidators: true }
  );
  if (!img) return next(new AppError('Không tìm thấy ảnh', 404));
  success(res, img, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const img = await FeedbackImage.findByIdAndDelete(req.params.id);
  if (!img) return next(new AppError('Không tìm thấy ảnh', 404));
  success(res, null, 'Xóa thành công');
};

exports.reorder = async (req, res) => {
  const items = req.body; // [{ id, order }]
  await Promise.all(items.map(({ id, order }) => FeedbackImage.findByIdAndUpdate(id, { order })));
  success(res, null, 'Đã cập nhật thứ tự');
};
