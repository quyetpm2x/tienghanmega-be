const mongoose = require('mongoose');

// Ngân hàng câu hỏi dùng chung cho tính năng "Bài kiểm tra" (khác hoàn toàn
// TopikQuestion — model đó chỉ phục vụ trang luyện tập public, phẳng, không
// có ảnh/audio/điểm số). Mỗi câu hỏi ở đây có thể được chọn vào nhiều Test.
const testQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  image:    { type: String, default: '' },   // ảnh minh hoạ câu hỏi (optional)
  audioUrl: { type: String, default: '' },   // file mp3 cho câu dạng Nghe (optional)
  options:  { type: [String], required: true, validate: v => v.length >= 2 },
  // Nhiều đáp án đúng khi length > 1 — không cần cờ riêng, suy ra trực tiếp
  // từ số lượng phần tử (UI dùng checkbox để đánh dấu, không phải radio).
  answerIndices: { type: [Number], required: true, validate: v => v.length >= 1 },
  explanation: { type: String, default: '' },
  skill: { type: String, enum: ['listening', 'reading', 'grammar', 'vocab'], required: true },
  level: { type: String, required: true },   // Sơ cấp / Trung cấp / TOPIK...
  points: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('TestQuestion', testQuestionSchema);
