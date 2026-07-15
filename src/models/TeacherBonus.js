const mongoose = require('mongoose');

const teacherBonusSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  type: { type: String, enum: ['bonus', 'penalty'], required: true },
  amount: { type: Number, required: true },
  date: { type: String, required: true }, // "2026-07-14" — ngày áp dụng, dùng để quy về tháng dương lịch hoặc chu kỳ trả lương
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
  className: { type: String, default: '' }, // denormalized để hiển thị nhanh, giống pattern Class.teacher
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('TeacherBonus', teacherBonusSchema);
