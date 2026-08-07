const mongoose = require('mongoose');

// "Đề thi Topik" — lắp từ CHUNG ngân hàng TestQuestion (dùng chung với hệ thống Bài
// kiểm tra nội bộ), nhưng phục vụ trang PUBLIC /topik (không gán theo lớp/đăng nhập
// như Test — chọn ngẫu nhiên 1 trong các đề đang isActive cho mọi khách truy cập).
const topikTestSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  duration: { type: Number, required: true }, // phút — UI chỉ cho chọn 1 trong 5 mốc cố định
  structureMode: { type: String, enum: ['flat', 'sectioned'], default: 'flat' },
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    order: { type: Number, required: true },
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('TopikTest', topikTestSchema);
