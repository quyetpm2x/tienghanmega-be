const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const { success } = require('../../utils/response');
const AppError = require('../../utils/AppError');

const ALLOWED_FOLDERS = ['materials', 'teachers', 'general', 'courses', 'community'];

// Giữ file trong RAM (không ghi ra đĩa cục bộ) — đĩa của server (Railway/Vercel...) không
// bền vững qua các lần deploy, nên ảnh phải đẩy thẳng lên Vercel Blob (storage bên ngoài).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file ảnh (jpg, png, gif, webp, svg)', 400));
  },
});

router.post('/', upload.single('image'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  try {
    const folder = ALLOWED_FOLDERS.includes(req.query.folder) ? req.query.folder : 'general';
    const ext  = path.extname(req.file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    await put(`${folder}/${name}`, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });
    // Trả về path tương đối (/cdn/...) thay vì URL vercel-storage.com trực tiếp — FE có
    // rewrite /cdn/:path* proxy sang Blob storage (xem next.config.js), giúp ảnh hiển thị
    // qua domain chính vì Vercel Blob chưa hỗ trợ gắn custom domain.
    success(res, { url: `/cdn/${folder}/${name}` }, 'Upload thành công');
  } catch (err) { next(err); }
});

module.exports = router;
