const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.login = async (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) return next(new AppError('Vui lòng nhập tài khoản và mật khẩu', 400));

  const admin = await Admin.findOne({ username });
  if (!admin || !(await admin.comparePassword(password))) {
    return next(new AppError('Tài khoản hoặc mật khẩu không đúng', 401));
  }

  const token = signToken(admin._id);
  success(res, { token, admin: { id: admin._id, name: admin.name, username: admin.username, role: admin.role } }, 'Đăng nhập thành công');
};

exports.me = async (req, res) => {
  success(res, { admin: req.admin });
};

exports.changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return next(new AppError('Vui lòng nhập đầy đủ thông tin', 400));
  if (newPassword.length < 6) return next(new AppError('Mật khẩu mới phải có ít nhất 6 ký tự', 400));

  const admin = await Admin.findById(req.admin._id);
  if (!(await admin.comparePassword(currentPassword))) {
    return next(new AppError('Mật khẩu hiện tại không đúng', 400));
  }

  admin.password = newPassword;
  await admin.save();
  success(res, null, 'Đổi mật khẩu thành công');
};
