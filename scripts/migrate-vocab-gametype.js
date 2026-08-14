// CHỈ đọc .env.development — không có fallback sang .env (production) dưới bất kỳ
// điều kiện nào, để không bao giờ lỡ tay chạy migration vào nhầm DB production.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.development') });
if (!process.env.MONGODB_URI) { console.error('Thiếu MONGODB_URI trong .env.development — dừng lại, không fallback sang .env.'); process.exit(1); }
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

// One-time: trước đây Vocab dùng chung 1 danh sách cho cả 4 mini-game (Flashcard/
// Ghép cặp/Nhanh tay/Điền chữ) ở trang /games. Từ nay mỗi doc chỉ thuộc đúng 1
// gameType — 4 game là 4 danh sách độc lập hoàn toàn. Script này nhân bản mỗi doc
// CHƯA có gameType thành 4 doc mới (1 mỗi game), giữ nguyên kr/vn/rom/level/order,
// rồi xoá doc gốc đi.
//
// CHỈ ĐỘNG DỮ LIỆU VÀO DOC CHƯA CÓ gameType. Chạy lại nhiều lần vẫn an toàn — doc
// đã có gameType (kể cả tạo mới sau migrate) sẽ bị bỏ qua.

const GAME_TYPES = ['flashcard', 'matching', 'speed', 'fill'];

async function migrateVocabGameType(db) {
  const col = db.collection('vocabs');
  const docs = await col.find({ gameType: { $exists: false } }).toArray();

  let created = 0;
  for (const doc of docs) {
    const clones = GAME_TYPES.map(gameType => ({
      kr: doc.kr, vn: doc.vn, rom: doc.rom, level: doc.level, order: doc.order,
      gameType,
      createdAt: doc.createdAt || new Date(), updatedAt: new Date(),
    }));
    await col.insertMany(clones);
    await col.deleteOne({ _id: doc._id });
    created += clones.length;
  }

  console.log(`  vocabs: ${docs.length} doc cũ (dùng chung) -> nhân thành ${created} doc mới (${GAME_TYPES.length} game/doc), đã xoá doc gốc.`);
}

async function run() {
  await connectDB();
  console.log('Connected to MongoDB');
  const db = mongoose.connection.db;

  await migrateVocabGameType(db);

  console.log('Done.');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
