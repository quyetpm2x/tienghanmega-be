const mongoose = require('mongoose');

// Đề kiểm tra — lắp ráp từ ngân hàng TestQuestion. assignedClassIds là danh
// sách lớp đã được gán đề này (tối đa 10 đề/lớp — validate ở controller khi
// gán, không ở schema vì giới hạn áp dụng theo phía Class chứ không phải Test).
const testSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  level: { type: String, required: true },        // Độ khó: Rất dễ / Dễ / Trung bình / Khó / Rất khó
  proficiency: { type: String, required: true },  // Trình độ: Sơ cấp 1 / Sơ cấp 2 / Trung cấp / TOPIK II
  duration: { type: Number, required: true },   // phút
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    points: { type: Number, required: true },
  }],
  assignedClassIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
}, { timestamps: true });

module.exports = mongoose.model('Test', testSchema);
