const Revenue = require('../models/Revenue');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const revenues = await Revenue.find().sort({ createdAt: 1 });
  success(res, revenues);
};

exports.upsert = async (req, res) => {
  const { month } = req.body;
  const revenue = await Revenue.findOneAndUpdate({ month }, req.body, { new: true, upsert: true, runValidators: true });
  success(res, revenue, 'Lưu doanh thu thành công');
};

exports.remove = async (req, res, next) => {
  const rev = await Revenue.findByIdAndDelete(req.params.id);
  if (!rev) return next(new AppError('Không tìm thấy bản ghi doanh thu', 404));
  success(res, null, 'Xóa thành công');
};
