const FeedbackVideo = require('../models/FeedbackVideo');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

function extractVideoId(url) {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

// Public: dùng cho trang chủ, sắp theo order
exports.getPublic = async (req, res) => {
  const videos = await FeedbackVideo.find().sort({ order: 1, createdAt: 1 });
  success(res, videos);
};

// Admin: tất cả
exports.getAll = async (req, res) => {
  const videos = await FeedbackVideo.find().sort({ order: 1, createdAt: 1 });
  success(res, videos);
};

exports.create = async (req, res, next) => {
  const { youtubeUrl, name, course } = req.body;
  if (!name?.trim() || !course?.trim()) return next(new AppError('Vui lòng nhập đủ tên học viên và khoá học', 400));
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return next(new AppError('Link YouTube không hợp lệ', 400));
  const count = await FeedbackVideo.countDocuments();
  const video = await FeedbackVideo.create({ youtubeUrl, videoId, name: name.trim(), course: course.trim(), order: count });
  success(res, video, 'Thêm video thành công', 201);
};

exports.update = async (req, res, next) => {
  const { youtubeUrl, name, course } = req.body;
  if (!name?.trim() || !course?.trim()) return next(new AppError('Vui lòng nhập đủ tên học viên và khoá học', 400));
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return next(new AppError('Link YouTube không hợp lệ', 400));
  const video = await FeedbackVideo.findByIdAndUpdate(
    req.params.id,
    { youtubeUrl, videoId, name: name.trim(), course: course.trim() },
    { new: true, runValidators: true }
  );
  if (!video) return next(new AppError('Không tìm thấy video', 404));
  success(res, video, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const video = await FeedbackVideo.findByIdAndDelete(req.params.id);
  if (!video) return next(new AppError('Không tìm thấy video', 404));
  success(res, null, 'Xóa thành công');
};

exports.reorder = async (req, res) => {
  const items = req.body; // [{ id, order }]
  await Promise.all(items.map(({ id, order }) => FeedbackVideo.findByIdAndUpdate(id, { order })));
  success(res, null, 'Đã cập nhật thứ tự');
};
