const SuccessVideo = require('../models/SuccessVideo');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const MAX_VIDEOS = 5;

function extractVideoId(url) {
  const m = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

// Public: dùng cho trang chủ, sắp theo order
exports.getPublic = async (req, res) => {
  const videos = await SuccessVideo.find().sort({ order: 1, createdAt: 1 });
  success(res, videos);
};

// Admin: tất cả
exports.getAll = async (req, res) => {
  const videos = await SuccessVideo.find().sort({ order: 1, createdAt: 1 });
  success(res, videos);
};

exports.create = async (req, res, next) => {
  const videoId = extractVideoId(req.body.youtubeUrl);
  if (!videoId) return next(new AppError('Link YouTube không hợp lệ', 400));
  const count = await SuccessVideo.countDocuments();
  if (count >= MAX_VIDEOS) return next(new AppError(`Chỉ được thêm tối đa ${MAX_VIDEOS} video`, 400));
  const video = await SuccessVideo.create({ youtubeUrl: req.body.youtubeUrl, videoId, order: count });
  success(res, video, 'Thêm video thành công', 201);
};

exports.update = async (req, res, next) => {
  const videoId = extractVideoId(req.body.youtubeUrl);
  if (!videoId) return next(new AppError('Link YouTube không hợp lệ', 400));
  const video = await SuccessVideo.findByIdAndUpdate(
    req.params.id,
    { youtubeUrl: req.body.youtubeUrl, videoId },
    { new: true, runValidators: true }
  );
  if (!video) return next(new AppError('Không tìm thấy video', 404));
  success(res, video, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const video = await SuccessVideo.findByIdAndDelete(req.params.id);
  if (!video) return next(new AppError('Không tìm thấy video', 404));
  success(res, null, 'Xóa thành công');
};
