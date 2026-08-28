const Teacher = require('../models/Teacher');
const { generateUniqueReferralCode } = require('../utils/referral');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { deleteManyFromBlob, staleMediaPaths } = require('../utils/uploadHandlers');

// totalPaidSalary/phone/adminNote are HR-only — never exposed on the
// public (unauthenticated) teacher endpoints, only when req.admin is set.
const SENSITIVE_FIELDS = '-totalPaidSalary -phone -adminNote';

// includeInactive: chỉ admin mới được xem GV đã nghỉ việc (isActive:false) — dữ
// liệu lương/lịch sử của họ vẫn còn nguyên trong DB (remove() chỉ soft-delete),
// nhưng mặc định ẩn khỏi mọi danh sách để không gây rối; admin bật cờ này lên khi
// cần tra cứu/thanh toán nốt lương còn nợ hoặc khôi phục lại.
exports.getAll = async (req, res) => {
  const filter = req.admin && req.query.includeInactive === 'true' ? {} : { isActive: true };
  const query = Teacher.find(filter).sort({ createdAt: 1 });
  if (!req.admin) query.select(SENSITIVE_FIELDS);
  const teachers = await query;

  // Teachers with an explicit order come first (ascending); everything else
  // keeps the default creation order — same pattern used for class/course ordering.
  teachers.sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return 0;
  });

  success(res, teachers);
};

exports.getOne = async (req, res, next) => {
  const query = Teacher.findById(req.params.id);
  if (!req.admin) query.select(SENSITIVE_FIELDS);
  const teacher = await query;
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  success(res, teacher);
};

exports.create = async (req, res) => {
  const teacher = new Teacher(req.body);
  teacher.referralCode = await generateUniqueReferralCode();
  await teacher.save();
  success(res, teacher, 'Tạo giảng viên thành công', 201);
};

exports.update = async (req, res, next) => {
  // referralCode chỉ được hệ thống tự set (qua create/generateReferralCode),
  // không cho client ghi đè trực tiếp qua form sửa thông tin thông thường.
  const { referralCode, ...rest } = req.body;
  const before = await Teacher.findById(req.params.id).select('src');
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  // Ảnh cũ (src) bị thay/xoá — dọn khỏi Blob. remove() chỉ soft-delete
  // (isActive:false), bản ghi + ảnh vẫn còn dùng nên KHÔNG dọn ở đó.
  if (rest.src !== undefined) {
    deleteManyFromBlob(staleMediaPaths(before?.src, rest.src)).catch(() => {});
  }
  success(res, teacher, 'Cập nhật thành công');
};

// POST /admin/teachers/:id/referral-code (mount /admin/teachers -> routes/teachers.js)
// — sinh mã giới thiệu cho giảng viên CHƯA có mã (idempotent).
exports.generateReferralCode = async (req, res, next) => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  if (!teacher.referralCode) {
    teacher.referralCode = await generateUniqueReferralCode();
    await teacher.save();
  }
  success(res, teacher, 'Đã tạo mã giới thiệu');
};

exports.remove = async (req, res, next) => {
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  success(res, null, 'Xóa thành công');
};
