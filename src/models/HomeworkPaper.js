const mongoose = require('mongoose');

// Đề BTVN — gom nhiều HomeworkQuestion để tái sử dụng nhiều lần khi giao bài
// (tuỳ chọn, giảng viên có thể bỏ qua bước này và giao trực tiếp câu hỏi từ ngân hàng).
const homeworkPaperSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  title: { type: String, required: true, trim: true },
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeworkQuestion', required: true },
    order: { type: Number, required: true },
  }],
}, { timestamps: true });

module.exports = mongoose.model('HomeworkPaper', homeworkPaperSchema);
