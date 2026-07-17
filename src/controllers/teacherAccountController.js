const Account = require('../models/Account');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin-only management of teacher login accounts. Never returns the bcrypt
// hash — .select('-password') on every read. `passwordPlain` (mật khẩu hiện
// tại, giải mã từ passwordPlainEnc) chỉ dành cho admin xem lại — route này
// nằm dưới /admin/* (đã được protect() bảo vệ ở routes/admin/index.js).
function withPlainPassword(account) {
  const obj = account.toObject();
  obj.passwordPlain = account.getPlainPassword();
  delete obj.passwordPlainEnc;
  return obj;
}

exports.getAll = async (req, res) => {
  const accounts = await Account.find({ role: 'teacher' }).select('-password +passwordPlainEnc').populate('teacherId', 'name').sort({ createdAt: -1 });
  success(res, accounts.map(withPlainPassword));
};

exports.create = async (req, res, next) => {
  const { teacherId, username, password } = req.body;
  if (!teacherId || !username || !password) return next(new AppError('Vui lòng nhập đầy đủ thông tin', 400));
  if (password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const existing = await Account.findOne({ teacherId, role: 'teacher' });
  if (existing) return next(new AppError('Giảng viên này đã có tài khoản', 400));

  const account = await Account.create({ teacherId, username, password, role: 'teacher' });
  const safe = await Account.findById(account._id).select('-password +passwordPlainEnc').populate('teacherId', 'name');
  success(res, withPlainPassword(safe), 'Tạo tài khoản thành công', 201);
};

exports.resetPassword = async (req, res, next) => {
  const { password } = req.body;
  if (!password || password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const account = await Account.findById(req.params.id);
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));

  account.password = password;
  account.mustChangePassword = true;
  await account.save();
  success(res, null, 'Đặt lại mật khẩu thành công');
};

exports.update = async (req, res, next) => {
  const { username, isActive } = req.body;
  const body = {};
  if (username !== undefined) body.username = username;
  if (isActive !== undefined) body.isActive = isActive;

  const account = await Account.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).select('-password +passwordPlainEnc').populate('teacherId', 'name');
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));
  success(res, withPlainPassword(account), 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const account = await Account.findByIdAndDelete(req.params.id);
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));
  success(res, null, 'Xoá tài khoản thành công');
};
