const mongoose = require('mongoose');

// Đề test đầu vào — song song với TopikTest, dùng chung ngân hàng
// TestQuestion. isActive ở đây nghĩa là "đủ điều kiện vào pool random" khi
// admin tạo phiên test cho một lead — KHÁC hẳn showOnHomepage (hiển thị công
// khai, cho phép khách tự làm bài qua trang chủ mà không cần admin gửi link
// trước, giống TopikTest.isActive) — 2 cờ độc lập, 1 đề có thể bật cả 2/1/0.
const placementTestSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  duration: { type: Number, required: true },
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    order: { type: Number, required: true },
  }],
  isActive: { type: Boolean, default: true },
  showOnHomepage: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PlacementTest', placementTestSchema);
