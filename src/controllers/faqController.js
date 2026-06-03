const FAQ = require('../models/FAQ');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Public: only active, ordered
exports.getPublic = async (req, res) => {
  const faqs = await FAQ.find({ active: true }).sort({ order: 1, createdAt: 1 });
  success(res, faqs);
};

// Admin: all
exports.getAll = async (req, res) => {
  const faqs = await FAQ.find().sort({ order: 1, createdAt: 1 });
  success(res, faqs);
};

exports.create = async (req, res) => {
  const faq = await FAQ.create(req.body);
  success(res, faq, 'Thêm câu hỏi thành công', 201);
};

exports.update = async (req, res, next) => {
  const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!faq) return next(new AppError('Không tìm thấy câu hỏi', 404));
  success(res, faq, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const faq = await FAQ.findByIdAndDelete(req.params.id);
  if (!faq) return next(new AppError('Không tìm thấy câu hỏi', 404));
  success(res, null, 'Xóa thành công');
};

exports.reorder = async (req, res) => {
  // req.body = [{ id, order }, ...]
  await Promise.all(req.body.map(({ id, order }) => FAQ.findByIdAndUpdate(id, { order })));
  success(res, null, 'Cập nhật thứ tự thành công');
};
