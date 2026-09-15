const mongoose = require('mongoose');
const { COURSE_CATEGORIES } = require('../utils/courseCategory');

const paymentSchema = new mongoose.Schema({
  studentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  // Tiền đóng cho GÓI. Không required ở schema để bản ghi trước chuyển đổi vẫn hợp lệ;
  // mọi đường ghi mới (services/studentEnrollmentService.js) bắt buộc truyền.
  packageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'EnrollmentPackage', index: true },
  studentName:    String,
  // classId/className/courseCategory: chỉ còn ý nghĩa với bản ghi cũ. Gói nhiều khoá
  // không có "một lớp" — lớp của khoản thu suy từ các ghi danh của gói.
  classId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className:      String,
  courseCategory: { type: String, enum: COURSE_CATEGORIES, default: 'conversation' },
  amount:         { type: Number, required: true, min: 1 },
  paidAt:         { type: Date, default: Date.now },
  note:           { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
