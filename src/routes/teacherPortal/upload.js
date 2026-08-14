const router = require('express').Router();
const { success } = require('../../utils/response');
const { imageUpload, audioUpload, uploadToBlob } = require('../../utils/uploadHandlers');

// Ảnh/audio đính kèm câu hỏi trong ngân hàng câu hỏi BTVN của giảng viên —
// route đã được bảo vệ bởi protectTeacher ở router cha (routes/teacherPortal/index.js).
router.post('/image', imageUpload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'homework-questions');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

router.post('/audio', audioUpload.single('audio'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const url = await uploadToBlob(req.file, 'homework-questions', '.mp3');
    success(res, { url }, 'Upload thành công');
  } catch (err) { next(err); }
});

module.exports = router;
