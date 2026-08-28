const Course = require('../models/Course');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { deleteManyFromBlob, staleMediaPaths } = require('../utils/uploadHandlers');

exports.getAll = async (req, res) => {
  const { cat } = req.query;
  const filter = req.admin ? {} : { isActive: true };
  if (cat && cat !== 'all') filter.cat = cat;
  const courses = await Course.find(filter).sort({ slug: 1 });

  // Courses with an explicit order come first (ascending); everything else
  // keeps the default slug order — same pattern used for class ordering.
  courses.sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return 0;
  });

  success(res, courses);
};

exports.getOne = async (req, res, next) => {
  const course = await Course.findOne({ slug: Number(req.params.id) });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  success(res, course);
};

exports.create = async (req, res) => {
  const course = await Course.create(req.body);
  success(res, course, 'Tạo khóa học thành công', 201);
};

exports.update = async (req, res, next) => {
  const before = await Course.findOne({ slug: Number(req.params.id) }).select('image');
  const course = await Course.findOneAndUpdate({ slug: Number(req.params.id) }, req.body, { new: true, runValidators: true });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  // Ảnh cũ bị thay bằng ảnh mới (hoặc bị xoá trắng) — dọn khỏi Blob, tránh rác
  // tích luỹ. Course.remove chỉ soft-delete (isActive:false) nên KHÔNG xoá ảnh
  // ở exports.remove — bản ghi còn tồn tại, ảnh vẫn đang được tham chiếu.
  if (req.body.image !== undefined) {
    deleteManyFromBlob(staleMediaPaths(before?.image, req.body.image)).catch(() => {});
  }
  success(res, course, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const course = await Course.findOneAndUpdate({ slug: Number(req.params.id) }, { isActive: false }, { new: true });
  if (!course) return next(new AppError('Không tìm thấy khóa học', 404));
  success(res, null, 'Xóa thành công');
};
