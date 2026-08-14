const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const AppError = require('./AppError');

// Multer instances dùng chung cho mọi route upload ảnh/audio trong hệ thống —
// giữ file trong RAM (không ghi ra đĩa cục bộ) vì đĩa của server không bền
// vững qua các lần deploy, file phải đẩy thẳng lên Vercel Blob.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file ảnh (jpg, png, gif, webp, svg)', 400));
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^audio\/(mpeg|mp3|wav|x-wav|ogg|webm)$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file âm thanh (mp3, wav, ogg)', 400));
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^video\/(mp4|webm|quicktime|x-msvideo)$/.test(file.mimetype);
    ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file video (mp4, webm, mov)', 400));
  },
});

// Store Blob của production dùng token riêng (BLOB_READ_WRITE_TOKEN_PRODUCT) khác
// với token mặc định (BLOB_READ_WRITE_TOKEN) mà @vercel/blob tự đọc — phải truyền
// tường minh, nếu không put() sẽ trỏ nhầm store ("This store does not exist").
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN_PRODUCT || process.env.BLOB_READ_WRITE_TOKEN;

// Đẩy file (đã nằm trong RAM qua multer) lên Vercel Blob, trả về path tương
// đối /cdn/... (không phải URL vercel-storage.com trực tiếp) — FE có rewrite
// /cdn/:path* proxy sang Blob storage (xem next.config.js).
async function uploadToBlob(file, folder, defaultExt = '') {
  const ext = path.extname(file.originalname).toLowerCase() || defaultExt;
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  await put(`${folder}/${name}`, file.buffer, {
    access: 'public',
    contentType: file.mimetype,
    token: BLOB_TOKEN,
  });
  return `/cdn/${folder}/${name}`;
}

module.exports = { imageUpload, audioUpload, videoUpload, uploadToBlob };
