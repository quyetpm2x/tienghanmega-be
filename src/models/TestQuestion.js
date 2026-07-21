const mongoose = require('mongoose');

// Ngân hàng câu hỏi dùng chung cho tính năng "Bài kiểm tra" (khác hoàn toàn
// TopikQuestion — model đó chỉ phục vụ trang luyện tập public, phẳng, không
// có ảnh/audio/điểm số). Mỗi câu hỏi ở đây có thể được chọn vào nhiều Test.
const testQuestionSchema = new mongoose.Schema({
  // 'multiple_choice' (trắc nghiệm, chấm tự động) hoặc 'essay' (tự luận — học
  // sinh gõ chữ/kèm ảnh/audio, giáo viên/admin phải chấm tay sau khi nộp).
  // KHÔNG nhận trực tiếp từ client — luôn suy ra tự động từ skill (skill ===
  // 'writing' → essay), xem hook pre('validate') bên dưới, để "loại câu hỏi"
  // không còn là 1 lựa chọn tách rời mà gộp thẳng vào "kỹ năng".
  questionType: { type: String, enum: ['multiple_choice', 'essay'], default: 'multiple_choice' },
  question: { type: String, required: true, trim: true },
  image:    { type: String, default: '' },   // ảnh minh hoạ câu hỏi (optional)
  audioUrl: { type: String, default: '' },   // file mp3 cho câu dạng Nghe (optional)
  // options/answerIndices chỉ bắt buộc với câu trắc nghiệm — câu tự luận không
  // dùng 2 field này. Dùng function() thường (không phải arrow) để "this" trỏ
  // đúng vào document đang validate.
  options:  { type: [String], required: function () { return this.questionType !== 'essay'; }, validate: { validator: function (v) { return this.questionType === 'essay' || v.length >= 2; } } },
  // Nhiều đáp án đúng khi length > 1 — không cần cờ riêng, suy ra trực tiếp
  // từ số lượng phần tử (UI dùng checkbox để đánh dấu, không phải radio).
  answerIndices: { type: [Number], required: function () { return this.questionType !== 'essay'; }, validate: { validator: function (v) { return this.questionType === 'essay' || v.length >= 1; } } },
  explanation: { type: String, default: '' },
  // 'writing' (Viết) là câu tự luận — kỹ năng này quyết định luôn questionType,
  // không có lựa chọn "loại câu hỏi" riêng.
  skill: { type: String, enum: ['listening', 'reading', 'grammar', 'vocab', 'writing'], required: true },
  level: { type: String, required: true },        // Độ khó: Rất dễ / Dễ / Trung bình / Khó / Rất khó
  proficiency: { type: String, required: true },  // Trình độ: Sơ cấp 1 / Sơ cấp 2 / Trung cấp / TOPIK II
  points: { type: Number, default: 1 },
}, { timestamps: true });

testQuestionSchema.pre('validate', function () {
  this.questionType = this.skill === 'writing' ? 'essay' : 'multiple_choice';
});

module.exports = mongoose.model('TestQuestion', testQuestionSchema);
