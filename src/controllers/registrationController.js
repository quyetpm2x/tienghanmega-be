const Registration = require('../models/Registration');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.submit = async (req, res, next) => {
  const { name, phone, level } = req.body;
  if (!name || !phone || !level) return next(new AppError('Vui lòng điền đầy đủ thông tin bắt buộc', 400));
  if (!/^0\d{9}$/.test(phone.replace(/\s/g, ''))) return next(new AppError('Số điện thoại không hợp lệ', 400));

  const reg = await Registration.create({ ...req.body, source: 'Website' });
  success(res, reg, 'Đăng ký thành công! Chúng tôi sẽ liên hệ bạn sớm nhất.', 201);
};

// Admin: get all registrations
exports.getAll = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  const regs = await Registration.find(filter).sort({ createdAt: -1 });
  success(res, regs);
};

exports.updateStatus = async (req, res, next) => {
  const reg = await Registration.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!reg) return next(new AppError('Không tìm thấy đơn', 404));
  success(res, reg, 'Cập nhật trạng thái thành công');
};

exports.remove = async (req, res, next) => {
  const reg = await Registration.findByIdAndDelete(req.params.id);
  if (!reg) return next(new AppError('Không tìm thấy đơn', 404));
  success(res, null, 'Xóa thành công');
};
