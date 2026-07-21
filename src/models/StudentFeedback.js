const mongoose = require('mongoose');

// Phản hồi của học sinh về giáo viên/lớp đang học — CHỈ admin xem được (không
// có bất kỳ route/API nào lộ dữ liệu này cho giáo viên), đúng cam kết bảo mật
// hiển thị bên phía học sinh khi gửi phản hồi.
const studentFeedbackSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  classId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  // Cho phép nửa sao (VD 3.5) — validator không phụ thuộc field khác (không
  // dùng "this") nên chạy đúng cả khi tạo mới (.save()) lẫn khi cập nhật qua
  // findOneAndUpdate({ runValidators: true }) như ở studentPortalController.
  rating: { type: Number, required: true, min: 1, max: 5, validate: { validator: v => Math.round(v * 2) === v * 2, message: 'Số sao chỉ được là bội số của 0.5' } },
  content:   { type: String, default: '', trim: true },
}, { timestamps: true });

// 1 học sinh chỉ có 1 phản hồi cho mỗi lớp — gửi lại sau đó là CẬP NHẬT
// (upsert ở controller), không tạo thêm bản ghi mới.
studentFeedbackSchema.index({ studentId: 1, classId: 1 }, { unique: true });

module.exports = mongoose.model('StudentFeedback', studentFeedbackSchema);
