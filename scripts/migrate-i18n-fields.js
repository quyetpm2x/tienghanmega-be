// Giống logic chọn file env trong src/server.js: NODE_ENV=production -> .env,
// còn lại (kể cả không set) -> .env.development. Cho phép chạy script này nhắm
// tới DB dev hoặc production tuỳ theo NODE_ENV khi gọi.
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
require('dotenv').config({ path: require('path').resolve(__dirname, '..', envFile) });
if (!process.env.MONGODB_URI) require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

// One-time: chuyển các field văn bản đơn ngữ (String) sang dạng đa ngôn ngữ
// { vi, ko } sau khi đổi schema Course/Teacher/Material/FAQ (xem
// src/utils/i18nField.js). Giá trị tiếng Việt cũ được giữ nguyên vào `vi`,
// `ko` để rỗng — admin bổ sung bản dịch Hàn sau qua trang quản trị.
//
// Dùng collection driver thô (không qua Mongoose model) vì model đã áp
// schema mới — đọc field cũ (string) qua model có thể bị cast sai lệch.
//
// CHỈ ĐỘNG DỮ LIỆU KHI FIELD ĐANG LÀ STRING (chưa migrate). Chạy lại nhiều
// lần vẫn an toàn — bản ghi đã ở dạng { vi, ko } sẽ được bỏ qua (idempotent).

const TARGETS = [
  { collection: 'courses', fields: ['title', 'desc', 'image', 'freeBonus'] },
  { collection: 'teachers', fields: ['cert', 'spec', 'src'] },
  { collection: 'materials', fields: ['title', 'cat', 'desc', 'src'] },
  { collection: 'faqs', fields: ['question', 'answer'] },
  { collection: 'coursecategories', fields: ['label'] },
  { collection: 'classes', fields: ['promo'] },
  { collection: 'feedbackimages', fields: ['image'] },
  { collection: 'communitylinks', fields: ['imageUrl'] },
];

// courses.commitment.target / courses.commitment.result là field lồng trong object con
// (không phải top-level như TARGETS ở trên) nên cần đọc/ghi theo đường dẫn dot-path riêng.
const NESTED_TARGETS = [
  { collection: 'courses', path: 'commitment.target' },
  { collection: 'courses', path: 'commitment.result' },
];

// courses.content là MẢNG nhiều dòng (không phải string đơn), tương tự teachers.credentials.
const ARRAY_TARGETS = [
  { collection: 'courses', field: 'content' },
];

async function migrateCollection(db, { collection, fields }) {
  const col = db.collection(collection);
  const docs = await col.find({}).toArray();
  let changed = 0;

  for (const doc of docs) {
    const $set = {};
    for (const field of fields) {
      const value = doc[field];
      if (typeof value === 'string') {
        $set[field] = { vi: value, ko: '' };
      } else if (value == null) {
        $set[field] = { vi: '', ko: '' };
      }
      // Nếu value đã là object {vi, ko} (đã migrate trước đó) -> bỏ qua field này.
    }
    if (Object.keys($set).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set });
      changed++;
    }
  }

  console.log(`  ${collection}: ${docs.length} bản ghi, ${changed} đã cập nhật.`);
}

// teachers.credentials là MẢNG nhiều dòng (không phải string đơn) nên không
// dùng chung logic migrateCollection ở trên (chỉ xử lý string/null) — cần
// nhánh riêng: mảng cũ -> { vi: <mảng cũ>, ko: [] }, đã là { vi, ko } thì bỏ qua.
async function migrateTeacherCredentials(db) {
  const col = db.collection('teachers');
  const docs = await col.find({}).toArray();
  let changed = 0;

  for (const doc of docs) {
    const value = doc.credentials;
    if (Array.isArray(value)) {
      await col.updateOne({ _id: doc._id }, { $set: { credentials: { vi: value, ko: [] } } });
      changed++;
    } else if (value == null) {
      await col.updateOne({ _id: doc._id }, { $set: { credentials: { vi: [], ko: [] } } });
      changed++;
    }
    // value đã là { vi, ko } (đã migrate trước đó) -> bỏ qua.
  }

  console.log(`  teachers.credentials: ${docs.length} bản ghi, ${changed} đã cập nhật.`);
}

// Đọc/ghi field lồng theo dot-path (VD "commitment.target") — dùng chung cho mọi
// collection cần chuyển 1 field String nằm trong object con sang { vi, ko }.
async function migrateNestedField(db, { collection, path }) {
  const col = db.collection(collection);
  const docs = await col.find({}).toArray();
  let changed = 0;

  for (const doc of docs) {
    const value = path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);
    let next;
    if (typeof value === 'string') next = { vi: value, ko: '' };
    else if (value == null) next = { vi: '', ko: '' };
    else continue; // đã là { vi, ko } -> bỏ qua

    await col.updateOne({ _id: doc._id }, { $set: { [path]: next } });
    changed++;
  }

  console.log(`  ${collection}.${path}: ${docs.length} bản ghi, ${changed} đã cập nhật.`);
}

// Field mảng top-level (VD courses.content) -> { vi: <mảng cũ>, ko: [] }, tương tự
// migrateTeacherCredentials nhưng dùng chung cho field/collection bất kỳ.
async function migrateArrayField(db, { collection, field }) {
  const col = db.collection(collection);
  const docs = await col.find({}).toArray();
  let changed = 0;

  for (const doc of docs) {
    const value = doc[field];
    let next;
    if (Array.isArray(value)) next = { vi: value, ko: [] };
    else if (value == null) next = { vi: [], ko: [] };
    else continue; // đã là { vi, ko } -> bỏ qua

    await col.updateOne({ _id: doc._id }, { $set: { [field]: next } });
    changed++;
  }

  console.log(`  ${collection}.${field}: ${docs.length} bản ghi, ${changed} đã cập nhật.`);
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;

  for (const target of TARGETS) {
    await migrateCollection(db, target);
  }
  await migrateTeacherCredentials(db);
  for (const target of NESTED_TARGETS) {
    await migrateNestedField(db, target);
  }
  for (const target of ARRAY_TARGETS) {
    await migrateArrayField(db, target);
  }

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
