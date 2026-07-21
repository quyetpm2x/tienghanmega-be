const StudentFeedback = require('../models/StudentFeedback');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin-only: xem/quản lý phản hồi (đánh giá sao + nội dung) học sinh gửi về
// giáo viên/lớp đang học. Cố tình KHÔNG có route nào cho giáo viên truy cập —
// đúng cam kết bảo mật đã hiển thị cho học sinh lúc gửi phản hồi.
exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.classId) filter.classId = req.query.classId;
  // "Từ X sao trở lên" thay vì khớp đúng bằng — rating giờ có thể lẻ (VD 3.5)
  // nên lọc đúng bằng 1 mốc nguyên sẽ bỏ sót các mức lẻ gần đó.
  if (req.query.minRating) filter.rating = { $gte: Number(req.query.minRating) };
  const feedbacks = await StudentFeedback.find(filter)
    .populate('studentId', 'name')
    .populate('classId', 'name teacher course')
    .sort({ createdAt: -1 });
  success(res, feedbacks);
};

exports.remove = async (req, res, next) => {
  const doc = await StudentFeedback.findByIdAndDelete(req.params.id);
  if (!doc) return next(new AppError('Không tìm thấy phản hồi', 404));
  success(res, null, 'Đã xoá phản hồi');
};
