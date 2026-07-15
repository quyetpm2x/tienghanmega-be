const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const Admin = require('../models/Admin');
const Account = require('../models/Account');

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

const optionalProtect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    if (admin) req.admin = admin;
  } catch {}
  next();
};

// Gates /teacher-portal/* — separate identity space from Admin. Requires the
// JWT to carry role:'teacher' (an admin token is rejected here, and vice
// versa protect() never accepts a teacher token since it only looks up Admin).
const protectTeacher = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Vui lòng đăng nhập', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'teacher') return next(new AppError('Token không hợp lệ', 401));
    const account = await Account.findById(decoded.id).select('-password').populate('teacherId');
    if (!account || !account.isActive) return next(new AppError('Tài khoản không tồn tại hoặc đã bị khoá', 401));
    req.teacherAccount = account;
    next();
  } catch {
    next(new AppError('Token không hợp lệ hoặc đã hết hạn', 401));
  }
};

module.exports = { protect, optionalProtect, protectTeacher };
