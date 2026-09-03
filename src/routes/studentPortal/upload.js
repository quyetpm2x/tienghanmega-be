const router = require('express').Router();
const { success } = require('../../utils/response');
const { imageUpload, homeworkImageUpload, HOMEWORK_IMAGE_MAX_COUNT, audioUpload, videoUpload, uploadToBlob } = require('../../utils/uploadHandlers');

// Upload ảnh/audio kèm theo câu trả lời tự luận — folder cố định 'essay-answers',
// route đã được bảo vệ bởi protectStudent ở router cha (routes/studentPortal/index.js).
router.post('/image', imageUpload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'essay-answers');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

router.post('/audio', audioUpload.single('audio'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'essay-answers', '.mp3');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

// Ảnh nộp bài BTVN (answerType === 'image') — cho phép NHIỀU ảnh cho 1 câu, mỗi
// ảnh tối đa 5MB (xem homeworkImageUpload). Khác /image ở trên: route đó dùng cho
// ảnh đính kèm bài tự luận hệ Test (1 ảnh, 4MB, folder 'essay-answers').
router.post('/homework-images', homeworkImageUpload.array('images', HOMEWORK_IMAGE_MAX_COUNT), async (req, res, next) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const urls = await Promise.all(req.files.map(f => uploadToBlob(f, 'homework-answers')));
    success(res, { urls }, 'Upload thành công');
  } catch (err) { next(err); }
});

// Video nộp bài BTVN (answerType === 'video') — folder riêng, không lẫn với ảnh/audio tự luận.
router.post('/video', videoUpload.single('video'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'homework-answers', '.mp4');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

module.exports = router;
