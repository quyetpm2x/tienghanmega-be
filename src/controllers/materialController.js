const Material = require('../models/Material');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { deleteManyFromBlob, staleMediaPaths } = require('../utils/uploadHandlers');

// Public — active only, sorted by order
exports.getAll = async (req, res) => {
  const materials = await Material.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
  success(res, materials);
};

// Admin — all records
exports.adminGetAll = async (req, res) => {
  const materials = await Material.find().sort({ order: 1, createdAt: 1 });
  success(res, materials);
};

exports.create = async (req, res) => {
  const count = await Material.countDocuments();
  const material = await Material.create({ order: count, ...req.body });
  success(res, material, 'Tạo tài liệu thành công', 201);
};

exports.update = async (req, res, next) => {
  const before = await Material.findById(req.params.id).select('src');
  const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!material) return next(new AppError('Không tìm thấy tài liệu', 404));
  // remove() chỉ soft-delete (isActive:false) nên KHÔNG dọn ảnh ở đó.
  if (req.body.src !== undefined) {
    deleteManyFromBlob(staleMediaPaths(before?.src, req.body.src)).catch(() => {});
  }
  success(res, material, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const material = await Material.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!material) return next(new AppError('Không tìm thấy tài liệu', 404));
  success(res, null, 'Đã xoá tài liệu');
};

exports.reorder = async (req, res) => {
  const items = req.body; // [{ id, order }]
  await Promise.all(items.map(({ id, order }) => Material.findByIdAndUpdate(id, { order })));
  success(res, null, 'Đã cập nhật thứ tự');
};
