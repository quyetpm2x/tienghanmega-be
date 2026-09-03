const multer = require('multer');
const path = require('path');
const { put, del } = require('@vercel/blob');
const sharp = require('sharp');
const AppError = require('./AppError');

// Multer instances dùng chung cho mọi route upload ảnh/audio trong hệ thống —
// giữ file trong RAM (không ghi ra đĩa cục bộ) vì đĩa của server không bền
// vững qua các lần deploy, file phải đẩy thẳng lên Vercel Blob.
// 4MB — áp dụng cho MỌI route upload ảnh trong hệ thống (câu hỏi test/BTVN, ảnh
// bài làm học sinh, ảnh admin: khoá học/giáo viên/banner...) vì đều dùng chung
// đúng 1 instance multer này.
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const imageFileFilter = (_req, file, cb) => {
  const ok = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype);
  ok ? cb(null, true) : cb(new AppError('Chỉ chấp nhận file ảnh (jpg, png, gif, webp, svg)', 400));
};
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: imageFileFilter,
});

// Ảnh BÀI LÀM BTVN của học sinh — instance RIÊNG (không dùng chung imageUpload ở
// trên) vì hạn mức khác: 5MB/ảnh và cho nộp NHIỀU ảnh cùng lúc cho 1 câu. Tách
// riêng để việc nới hạn mức ở đây không vô tình nới cho mọi route upload ảnh khác.
const HOMEWORK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const HOMEWORK_IMAGE_MAX_COUNT = 10;
const homeworkImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HOMEWORK_IMAGE_MAX_BYTES, files: HOMEWORK_IMAGE_MAX_COUNT },
  fileFilter: imageFileFilter,
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

// Chỉ nén ảnh RASTER. Cố tình BỎ QUA:
//  - image/svg+xml: là vector, rasterize ra là mất khả năng phóng to vô hạn
//  - image/gif: có thể là ảnh động, sharp mặc định chỉ giữ frame đầu
// Audio/video đi qua uploadToBlob cũng không khớp regex nên không bị đụng tới.
const COMPRESSIBLE_IMAGE = /^image\/(jpeg|jpg|png|webp)$/;
// 1600px là dư cho mọi vị trí hiển thị trên web (kể cả màn Retina) — ảnh gốc
// admin upload thường là ảnh thiết kế khổ lớn 3000-5000px, nặng gấp hàng chục lần
// mà hiển thị ra không đẹp hơn chút nào.
const IMAGE_MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;

// Trả về buffer WebP đã nén, hoặc null nếu KHÔNG nên nén (không phải ảnh raster,
// nén xong lại to hơn, hoặc sharp lỗi). null = giữ nguyên file gốc — nén là tối
// ưu hoá, không bao giờ được phép làm hỏng thao tác upload.
async function compressImage(file) {
  if (!COMPRESSIBLE_IMAGE.test(file.mimetype)) return null;
  try {
    const buffer = await sharp(file.buffer)
      // .rotate() không tham số = xoay theo EXIF orientation. Phải gọi TRƯỚC
      // resize, nếu không ảnh chụp dọc từ điện thoại (ảnh bài làm học sinh) sẽ
      // bị resize theo chiều sai rồi mới xoay.
      .rotate()
      .resize({ width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    if (buffer.length >= file.buffer.length) return null;
    return buffer;
  } catch (err) {
    console.error('[compressImage] nén thất bại, dùng file gốc:', err.message);
    return null;
  }
}

// Đẩy file (đã nằm trong RAM qua multer) lên Vercel Blob, trả về path tương
// đối /cdn/... (không phải URL vercel-storage.com trực tiếp) — FE có rewrite
// /cdn/:path* proxy sang Blob storage (xem next.config.js).
async function uploadToBlob(file, folder, defaultExt = '') {
  const compressed = await compressImage(file);
  const buffer = compressed || file.buffer;
  // Nén xong thì file LUÔN là webp — đuôi và contentType phải đổi theo, nếu
  // không Blob sẽ trả về ảnh webp kèm header "image/png" và trình duyệt Safari
  // từ chối hiển thị.
  const ext = compressed ? '.webp' : (path.extname(file.originalname).toLowerCase() || defaultExt);
  const contentType = compressed ? 'image/webp' : file.mimetype;
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
  await put(`${folder}/${name}`, buffer, {
    access: 'public',
    contentType,
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

module.exports = { imageUpload, homeworkImageUpload, HOMEWORK_IMAGE_MAX_BYTES, HOMEWORK_IMAGE_MAX_COUNT, audioUpload, videoUpload, uploadToBlob, deleteFromBlob, deleteManyFromBlob, mediaPaths, staleMediaPaths };
