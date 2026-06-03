const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { success } = require('../../utils/response');
const AppError = require('../../utils/AppError');

const BASE_DIR = path.join(__dirname, '../../../public/uploads');
const ALLOWED_FOLDERS = ['materials', 'teachers', 'general'];

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const folder = ALLOWED_FOLDERS.includes(req.query.folder) ? req.query.folder : 'general';
    const dir = path.join(BASE_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file ảnh (jpg, png, gif, webp, svg)', 400));
  },
});

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
  const folder = ALLOWED_FOLDERS.includes(req.query.folder) ? req.query.folder : 'general';
  const url = `/uploads/${folder}/${req.file.filename}`;
  success(res, { url }, 'Upload thành công');
});

module.exports = router;
