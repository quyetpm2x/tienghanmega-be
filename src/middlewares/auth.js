const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const Admin = require('../models/Admin');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Vui lòng đăng nhập', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) return next(new AppError('Tài khoản không tồn tại', 401));
    req.admin = admin;
    next();
  } catch {
    next(new AppError('Token không hợp lệ hoặc đã hết hạn', 401));
  }
};

module.exports = { protect };
