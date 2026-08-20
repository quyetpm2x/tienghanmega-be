const mongoose = require('mongoose');

// Ngân hàng câu hỏi BTVN — RIÊNG TỪNG GIẢNG VIÊN (khác hẳn TestQuestion do admin
// quản lý dùng chung cho toàn hệ thống). Đề bài có thể kết hợp text + tuỳ chọn
// link YouTube (tự nhúng video ở FE)/ảnh/audio; answerTypes quyết định học sinh
// được phép nộp bài dưới (những) dạng nào — nếu chọn nhiều hơn 1 dạng, học sinh
// tự chọn 1 trong số đó để làm (VD: quay video HOẶC viết bài), không bắt buộc làm hết.
const homeworkQuestionSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  question: { type: String, required: true, trim: true },
  youtubeUrl: { type: String, default: '' },
  image: { type: String, default: '' },
  audioUrl: { type: String, default: '' },
  // 'audio' giữ lại trong enum chỉ để KHÔNG phá dữ liệu câu hỏi cũ đã có sẵn dạng
  // này — form tạo/sửa câu hỏi ở FE không còn cho chọn 'audio' cho câu MỚI nữa.
  answerTypes: {
    type: [{ type: String, enum: ['text', 'multiple_choice', 'video', 'audio', 'image'] }],
    validate: v => Array.isArray(v) && v.length > 0,
  },
  // Chỉ dùng khi answerTypes bao gồm 'multiple_choice'.
  options: { type: [String], default: [] },
  answerIndices: { type: [Number], default: [] },
  points: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('HomeworkQuestion', homeworkQuestionSchema);
