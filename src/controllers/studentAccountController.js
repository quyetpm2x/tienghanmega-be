const Account = require('../models/Account');
const { activeClassesByStudent } = require('../utils/enrollment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { invalidateStudentIndex } = require('../utils/studentIndexCache');

// Admin/giáo viên quản lý tài khoản đăng nhập của học viên. Never returns the
// bcrypt hash — .select('-password') on every read. Cố tình KHÔNG có hàm
// xoá (remove) — theo yêu cầu chỉ được khoá tài khoản (isActive=false), không
// được xoá, để giữ nguyên lịch sử điểm/học phí gắn với tài khoản.
// `passwordPlain` (mật khẩu hiện tại, giải mã) chỉ dành cho admin xem lại —
// route này nằm dưới /admin/* (đã được protect() bảo vệ ở routes/admin/index.js).
async function withPlainPassword(accounts) {
  const list = Array.isArray(accounts) ? accounts : [accounts];
  const studentIds = list.map(a => a.studentId && a.studentId._id).filter(Boolean);
  const classes = await activeClassesByStudent(studentIds);
  const out = list.map(account => {
    const obj = account.toObject();
    obj.passwordPlain = account.getPlainPassword();
    delete obj.passwordPlainEnc;
    if (obj.studentId && obj.studentId._id) {
      const names = (classes.get(String(obj.studentId._id)) || []).map(c => c.className).filter(Boolean);
      obj.studentId = { ...obj.studentId, classNames: names, className: names.join(' + ') };
    }
    return obj;
  });
  return Array.isArray(accounts) ? out : out[0];
}

exports.getAll = async (req, res) => {
  const accounts = await Account.find({ role: 'student' }).select('-password +passwordPlainEnc').populate('studentId', 'name').sort({ createdAt: -1 });
  success(res, await withPlainPassword(accounts));
};

exports.create = async (req, res, next) => {
  const { studentId, username, password } = req.body;
  if (!studentId || !username || !password) return next(new AppError('Vui lòng nhập đầy đủ thông tin', 400));
  if (password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const existing = await Account.findOne({ studentId, role: 'student' });
  if (existing) return next(new AppError('Học viên này đã có tài khoản', 400));

  const account = await Account.create({ studentId, username, password, role: 'student' });
  invalidateStudentIndex();
  const safe = await Account.findById(account._id).select('-password +passwordPlainEnc').populate('studentId', 'name');
  success(res, await withPlainPassword(safe), 'Tạo tài khoản thành công', 201);
};

exports.resetPassword = async (req, res, next) => {
  const { password } = req.body;
  if (!password || password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const account = await Account.findOne({ _id: req.params.id, role: 'student' });
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

  const account = await Account.findOneAndUpdate({ _id: req.params.id, role: 'student' }, body, { new: true, runValidators: true }).select('-password +passwordPlainEnc').populate('studentId', 'name');
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));
  invalidateStudentIndex();
  success(res, await withPlainPassword(account), 'Cập nhật thành công');
};
