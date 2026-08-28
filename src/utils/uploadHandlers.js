const multer = require('multer');
const path = require('path');
const { put, del } = require('@vercel/blob');
const AppError = require('./AppError');

// Multer instances dùng chung cho mọi route upload ảnh/audio trong hệ thống —
// giữ file trong RAM (không ghi ra đĩa cục bộ) vì đĩa của server không bền
// vững qua các lần deploy, file phải đẩy thẳng lên Vercel Blob.
// 4MB — áp dụng cho MỌI route upload ảnh trong hệ thống (câu hỏi test/BTVN, ảnh
// bài làm học sinh, ảnh admin: khoá học/giáo viên/banner...) vì đều dùng chung
// đúng 1 instance multer này.
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
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

// Xoá 1 file khỏi Blob theo đúng path tương đối đã lưu trong DB (dạng
// "/cdn/folder/name.ext", xem uploadToBlob ở trên). Bỏ qua an toàn nếu rỗng
// hoặc KHÔNG phải path do chính hệ thống upload (admin có thể dán thẳng URL
// ngoài thay vì upload file — không được đụng vào). Luôn nuốt lỗi (best-effort):
// xoá thất bại (VD đã bị xoá tay trước đó) không được làm hỏng thao tác chính
// (update/xoá bản ghi) đang gọi hàm này.
async function deleteFromBlob(cdnPath) {
  if (!cdnPath || typeof cdnPath !== 'string' || !cdnPath.startsWith('/cdn/')) return;
  try {
    await del(cdnPath.slice('/cdn/'.length), { token: BLOB_TOKEN });
  } catch (err) {
    console.error('[deleteFromBlob] failed to delete', cdnPath, err.message);
  }
}

// 1 field ảnh/audio trong DB có thể là string đơn HOẶC i18nField dạng {vi, ko}
// — chuẩn hoá về mảng string phẳng để xoá hết mọi bản ngôn ngữ cùng lúc.
function mediaPaths(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'object') return Object.values(value).filter(v => typeof v === 'string');
  return [];
}

// Xoá nhiều file cùng lúc — nhận thẳng danh sách field (string hoặc {vi,ko}),
// tự trải phẳng qua mediaPaths rồi xoá song song. Dùng khi 1 record có nhiều
// field media (VD câu hỏi có cả ảnh lẫn audio) hoặc field i18n 2 ngôn ngữ.
async function deleteManyFromBlob(...values) {
  const paths = values.flatMap(mediaPaths);
  await Promise.all(paths.map(deleteFromBlob));
}

// So sánh giá trị field CŨ (trước update) với giá trị MỚI (sau update), trả về
// đúng những path đã bị THAY THẾ/bỏ đi — path nào vẫn còn giữ nguyên ở giá trị
// mới thì KHÔNG được xoá (VD admin chỉ đổi ảnh bản KO, ảnh bản VI phải giữ lại).
function staleMediaPaths(oldValue, newValue) {
  const kept = new Set(mediaPaths(newValue));
  return mediaPaths(oldValue).filter(p => !kept.has(p));
}

module.exports = { imageUpload, audioUpload, videoUpload, uploadToBlob, deleteFromBlob, deleteManyFromBlob, mediaPaths, staleMediaPaths };
