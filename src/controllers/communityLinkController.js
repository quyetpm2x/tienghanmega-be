const CommunityLink = require('../models/CommunityLink');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const MAX_LINKS = 10;

// Public: dùng cho trang chủ, sắp theo order
exports.getPublic = async (req, res) => {
  const links = await CommunityLink.find().sort({ order: 1, createdAt: 1 });
  success(res, links);
};

// Admin: tất cả
exports.getAll = async (req, res) => {
  const links = await CommunityLink.find().sort({ order: 1, createdAt: 1 });
  success(res, links);
};

exports.create = async (req, res, next) => {
  const { imageUrl, linkUrl } = req.body;
  if (!imageUrl || !linkUrl) return next(new AppError('Vui lòng nhập đủ ảnh và link', 400));
  const count = await CommunityLink.countDocuments();
  if (count >= MAX_LINKS) return next(new AppError(`Chỉ được thêm tối đa ${MAX_LINKS} ảnh`, 400));
  const link = await CommunityLink.create({ imageUrl, linkUrl, order: count });
  success(res, link, 'Thêm ảnh thành công', 201);
};

exports.update = async (req, res, next) => {
  const { imageUrl, linkUrl } = req.body;
  if (!imageUrl || !linkUrl) return next(new AppError('Vui lòng nhập đủ ảnh và link', 400));
  const link = await CommunityLink.findByIdAndUpdate(
    req.params.id,
    { imageUrl, linkUrl },
    { new: true, runValidators: true }
  );
  if (!link) return next(new AppError('Không tìm thấy ảnh', 404));
  success(res, link, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const link = await CommunityLink.findByIdAndDelete(req.params.id);
  if (!link) return next(new AppError('Không tìm thấy ảnh', 404));
  success(res, null, 'Đã xoá ảnh');
};

exports.reorder = async (req, res) => {
  const items = req.body; // [{ id, order }]
  await Promise.all(items.map(({ id, order }) => CommunityLink.findByIdAndUpdate(id, { order })));
  success(res, null, 'Đã cập nhật thứ tự');
};
