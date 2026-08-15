const Admin = require('../models/Admin');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { CLUSTERS, PERMISSIONS, PERMISSION_KEYS } = require('../config/adminPermissions');

// Chỉ super_admin gọi tới được các hàm này — xem middlewares/permit.js#superAdminOnly
// gắn ở route. Không có field nào ở đây được "uỷ quyền" qua permissions[] của chính
// đối tượng bị thao tác (tránh 1 admin thường tự leo thang đặc quyền).

function sanitizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter(p => PERMISSION_KEYS.has(p));
}

exports.getAll = async (req, res) => {
  const admins = await Admin.find().select('-password').sort({ createdAt: 1 });
  success(res, admins);
};

// FE dựng checkbox tree trực tiếp từ đây — không hardcode lặp lại danh mục quyền.
exports.getPermissionCatalog = (req, res) => {
  success(res, { clusters: CLUSTERS, permissions: PERMISSIONS });
};

exports.create = async (req, res, next) => {
  const { username, password, name, role, permissions } = req.body;
  if (!username || !username.trim()) return next(new AppError('Vui lòng nhập tên đăng nhập', 400));
  if (!name || !name.trim()) return next(new AppError('Vui lòng nhập họ tên', 400));
  if (!password || password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const finalRole = role === 'super_admin' ? 'super_admin' : 'admin';
  const admin = await Admin.create({
    username: username.trim(), password, name: name.trim(), role: finalRole,
    permissions: finalRole === 'super_admin' ? [] : sanitizePermissions(permissions),
  });
  const obj = admin.toObject();
  delete obj.password;
  success(res, obj, 'Tạo quản trị viên thành công', 201);
};

exports.update = async (req, res, next) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return next(new AppError('Không tìm thấy quản trị viên', 404));

  const { username, password, name, role, permissions } = req.body;
  const isSelf = String(admin._id) === String(req.admin._id);

  if (username !== undefined) {
    if (!username.trim()) return next(new AppError('Tên đăng nhập không được để trống', 400));
    admin.username = username.trim();
  }
  if (name !== undefined) {
    if (!name.trim()) return next(new AppError('Họ tên không được để trống', 400));
    admin.name = name.trim();
  }
  if (password) {
    if (password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));
    admin.password = password;
  }

  if (role !== undefined) {
    const nextRole = role === 'super_admin' ? 'super_admin' : 'admin';
    // Không cho tự hạ quyền nếu mình đang là super_admin cấp cao DUY NHẤT — tránh
    // khoá luôn quyền quản lý quản trị viên của cả hệ thống.
    if (isSelf && admin.role === 'super_admin' && nextRole !== 'super_admin') {
      const otherSuperAdmins = await Admin.countDocuments({ role: 'super_admin', _id: { $ne: admin._id } });
      if (otherSuperAdmins === 0) return next(new AppError('Không thể tự hạ quyền — bạn là quản trị viên cấp cao duy nhất', 400));
    }
    admin.role = nextRole;
  }

  if (admin.role === 'super_admin') {
    admin.permissions = []; // super_admin không cần danh sách quyền, luôn toàn quyền
  } else if (permissions !== undefined) {
    admin.permissions = sanitizePermissions(permissions);
  }

  await admin.save();
  const obj = admin.toObject();
  delete obj.password;
  success(res, obj, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  if (String(req.params.id) === String(req.admin._id)) {
    return next(new AppError('Không thể tự xoá tài khoản đang đăng nhập', 400));
  }
  const admin = await Admin.findById(req.params.id);
  if (!admin) return next(new AppError('Không tìm thấy quản trị viên', 404));
  if (admin.role === 'super_admin') {
    const otherSuperAdmins = await Admin.countDocuments({ role: 'super_admin', _id: { $ne: admin._id } });
    if (otherSuperAdmins === 0) return next(new AppError('Không thể xoá quản trị viên cấp cao duy nhất còn lại', 400));
  }
  await Admin.findByIdAndDelete(req.params.id);
  success(res, null, 'Xoá thành công');
};
