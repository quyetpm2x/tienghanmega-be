// Giống logic chọn file env trong src/server.js: NODE_ENV=production -> .env,
// còn lại (kể cả không set) -> .env.development.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', envFile) });
if (!process.env.MONGODB_URI) require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const { uploadToBlob } = require('../src/utils/uploadHandlers');

// One-time: teachers.src.{vi,ko} trước đây được encode thẳng thành base64
// (data:image/...;base64,...) và lưu trực tiếp trong MongoDB thay vì upload
// lên CDN (Vercel Blob) như mọi loại ảnh khác trong hệ thống. Script này giải
// mã base64, đẩy lên CDN qua uploadToBlob() (giống route /admin/upload), rồi
// thay giá trị field bằng URL CDN trả về.
//
// CHỈ ĐỘNG DỮ LIỆU KHI GIÁ TRỊ BẮT ĐẦU BẰNG "data:image/" (chưa migrate).
// Chạy lại nhiều lần vẫn an toàn — field đã là URL (CDN hoặc URL ngoài) sẽ bị bỏ qua.

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
  'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
};

async function migrateTeacherPhotos(db) {
  const col = db.collection('teachers');
  const docs = await col.find({}).toArray();
  let changed = 0;
  let failed = 0;

  for (const doc of docs) {
    const src = doc.src;
    if (src == null || typeof src === 'string') continue; // chưa migrate sang {vi,ko} -> bỏ qua, không thuộc phạm vi script này
    const $set = {};

    for (const lang of ['vi', 'ko']) {
      const value = src[lang];
      if (typeof value !== 'string' || !value.startsWith('data:image/')) continue;

      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(value);
      if (!match) continue;
      const [, mimetype, base64Data] = match;
      const ext = MIME_EXT[mimetype] || '.jpg';
      const buffer = Buffer.from(base64Data, 'base64');

      try {
        const url = await uploadToBlob({ originalname: `photo${ext}`, buffer, mimetype }, 'teachers');
        $set[`src.${lang}`] = url;
      } catch (err) {
        failed++;
        console.error(`  Lỗi upload teachers/${doc._id}.src.${lang}: ${err.message}`);
      }
    }

    if (Object.keys($set).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set });
      changed++;
    }
  }

  console.log(`  teachers.src: ${docs.length} bản ghi, ${changed} đã cập nhật, ${failed} lỗi upload.`);
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;

  await migrateTeacherPhotos(db);

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
