const router = require('express').Router();
const { success } = require('../../utils/response');
const { imageUpload, audioUpload, videoUpload, uploadToBlob } = require('../../utils/uploadHandlers');

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

// Video nộp bài BTVN (answerType === 'video') — folder riêng, không lẫn với ảnh/audio tự luận.
router.post('/video', videoUpload.single('video'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'homework-answers', '.mp4');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

module.exports = router;
