const mongoose = require('mongoose');

// Đề test đầu vào — song song với TopikTest, dùng chung ngân hàng
// TestQuestion. isActive ở đây nghĩa là "đủ điều kiện vào pool random" khi
// admin tạo phiên test cho một lead (KHÁC nghĩa "hiển thị công khai" của
// TopikTest — tính năng này không có trang public tự do).
const placementTestSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  duration: { type: Number, required: true },
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    order: { type: Number, required: true },
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('PlacementTest', placementTestSchema);
