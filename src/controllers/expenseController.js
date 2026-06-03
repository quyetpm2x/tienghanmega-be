const Expense  = require('../models/Expense');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.month) filter.month = req.query.month;
  const expenses = await Expense.find(filter).sort({ month: -1, paidAt: -1 });
  success(res, expenses);
};

exports.create = async (req, res) => {
  const expense = await Expense.create(req.body);
  success(res, expense, 'Thêm chi phí thành công', 201);
};

exports.update = async (req, res, next) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!expense) return next(new AppError('Không tìm thấy chi phí', 404));
  success(res, expense, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return next(new AppError('Không tìm thấy chi phí', 404));
  success(res, null, 'Xóa thành công');
};
