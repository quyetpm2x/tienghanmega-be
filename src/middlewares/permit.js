const AppError = require('../utils/AppError');
const { PERMISSION_KEYS } = require('../config/adminPermissions');

// Dùng SAU protect() trên route /admin/* — chặn theo đúng quyền cụ thể (xem
// src/config/adminPermissions.js cho danh mục đầy đủ). super_admin luôn qua,
// không đọc permissions[]; admin thường phải có đúng key trong permissions[].
//
// Validate key ngay lúc ĐĂNG KÝ ROUTE (không phải lúc request tới) — gõ nhầm
// key sẽ làm server crash ngay khi khởi động thay vì âm thầm luôn từ chối/luôn
// cho qua ở production.
function permit(key) {
  if (!PERMISSION_KEYS.has(key)) {
    throw new Error(`permit(): quyền "${key}" không tồn tại trong catalog — kiểm tra lại src/config/adminPermissions.js`);
  }
  return (req, res, next) => {
    if (!req.admin) return next(new AppError('Vui lòng đăng nhập', 401));
    if (req.admin.role === 'super_admin') return next();
    if (req.admin.permissions && req.admin.permissions.includes(key)) return next();
    next(new AppError('Bạn không có quyền thực hiện thao tác này', 403));
  };
}

// Chỉ super_admin — dùng riêng cho khu vực quản lý quản trị viên. Không thể cấp
// qua checkbox permissions[] (tránh 1 admin thường tự cấp thêm quyền cho mình).
function superAdminOnly(req, res, next) {
  if (!req.admin) return next(new AppError('Vui lòng đăng nhập', 401));
  if (req.admin.role !== 'super_admin') return next(new AppError('Chỉ quản trị viên cấp cao mới được truy cập chức năng này', 403));
  next();
}

module.exports = { permit, superAdminOnly };
