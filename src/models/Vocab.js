const mongoose = require('mongoose');
const vocabSchema = new mongoose.Schema({
  kr:    { type: String, required: true },
  vn:    { type: String, required: true },
  rom:   { type: String, required: true },
  level: { type: String, default: 'basic' },
  order: { type: Number, default: 0 },
  // Mỗi từ chỉ thuộc đúng 1 game — 4 game là 4 danh sách độc lập hoàn toàn (sửa/xoá
  // ở game này không đụng game khác), dù dùng chung 1 model/shape dữ liệu.
  gameType: { type: String, enum: ['flashcard', 'matching', 'speed', 'fill'], required: true, index: true },
}, { timestamps: true });
module.exports = mongoose.model('Vocab', vocabSchema);
