const Schedule = require('../models/Schedule');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const schedules = await Schedule.find().sort({ createdAt: 1 });
  success(res, schedules);
};

exports.create = async (req, res) => {
  const schedule = await Schedule.create(req.body);
  success(res, schedule, 'Tạo lịch khai giảng thành công', 201);
};

exports.update = async (req, res, next) => {
  const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!schedule) return next(new AppError('Không tìm thấy lịch', 404));
  success(res, schedule, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const schedule = await Schedule.findByIdAndDelete(req.params.id);
  if (!schedule) return next(new AppError('Không tìm thấy lịch', 404));
  success(res, null, 'Xóa thành công');
};
