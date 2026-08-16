const mongoose = require('mongoose');

const teacherSessionSchema = new mongoose.Schema({
  teacherName: { type: String, required: true },
  date: { type: String, required: true },
  className: { type: String, required: true },
  status: { type: String, enum: ['taught', 'not-taught', 'rescheduled', 'absent', 'substituted'], default: 'not-taught' },
  note: { type: String, default: '' },
  rescheduledDate: { type: String, default: '' },
  rescheduledTime: { type: String, default: '' },
  rescheduleHistory: [{
    date: String,
    time: String,
    savedAt: { type: Date, default: Date.now },
  }],
  // status==='substituted': giáo viên gốc (teacherName) không dạy buổi này — giáo viên
  // dưới đây dạy thay, chỉ 1 buổi, KHÔNG đụng tới teacherAssignments của cả lớp (khác
  // hẳn "Đổi giáo viên phụ trách" — đó là đổi lâu dài, đây là ngoại lệ 1 buổi).
  substituteTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  substituteTeacherName: { type: String, default: '' },
  // Lương riêng cho ĐÚNG buổi dạy thay này — để trống (null) thì tính theo đơn
  // giá/buổi mặc định của lớp (Class.ratePerSession), giống mọi buổi bình thường.
  // Có giá trị thì override, không đụng gì tới ratePerSession của lớp hay các buổi
  // dạy khác — dùng khi giáo viên dạy thay được trả khác giáo viên chính (VD Cô A
  // 200k/buổi, Cô B dạy thay buổi này 300k hoặc 180k).
  substituteRate: { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model('TeacherSession', teacherSessionSchema);
