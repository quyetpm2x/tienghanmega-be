const Expense  = require('../models/Expense');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { normalizeExpenseBody } = require('../utils/expenseInput');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.month) filter.month = req.query.month;
  const expenses = await Expense.find(filter).sort({ month: -1, paidAt: -1 });
  success(res, expenses);
};

exports.create = async (req, res) => {
  // `month` luôn suy từ ngày chi (xem utils/expenseInput.js) — client gửi lên cũng bị bỏ qua.
  const expense = await Expense.create(normalizeExpenseBody(req.body));
  success(res, expense, 'Thêm chi phí thành công', 201);
};

exports.update = async (req, res, next) => {
  const expense = await Expense.findByIdAndUpdate(req.params.id, normalizeExpenseBody(req.body, { partial: true }), { new: true, runValidators: true });
  if (!expense) return next(new AppError('Không tìm thấy chi phí', 404));
  success(res, expense, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return next(new AppError('Không tìm thấy chi phí', 404));
  success(res, null, 'Xóa thành công');
};
