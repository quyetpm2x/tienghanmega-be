const mongoose = require('mongoose');

// 1 bản ghi = 1 lần đánh dấu đã trả lương cho 1 giáo viên trong 1 chu kỳ trả
// lương (10 tháng này → 9 tháng sau, trả vào 25). periodStart luôn là ngày 10.
const teacherPaymentSchema = new mongoose.Schema({
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  periodStart: { type: String, required: true }, // "2026-06-10"
  periodEnd:   { type: String, required: true }, // "2026-07-09"
  amountPaid:  { type: Number, required: true },
  paidDate:    { type: String, required: true }, // ngày trả thực tế
  note:        { type: String, default: '' },
}, { timestamps: true });

teacherPaymentSchema.index({ teacherId: 1, periodStart: 1 }, { unique: true });

module.exports = mongoose.model('TeacherPayment', teacherPaymentSchema);
