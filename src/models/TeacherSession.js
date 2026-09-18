const mongoose = require('mongoose');

const teacherSessionSchema = new mongoose.Schema({
  teacherName: { type: String, required: true },
  date: { type: String, required: true },
  // Lớp gốc. className chỉ là bản sao để hiển thị (đồng bộ khi đổi tên lớp).
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
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
  // Chốt đích danh cho MỘT buổi: tính vào kỳ lương nào, cho ai, bao nhiêu tiền.
  // Cả ba để trống (bản ghi cũ) thì suy từ lịch lớp tại ngày gốc như trước —
  // xem utils/sessionPay.js. Không migration, không đổi số lương lịch sử.
  payDate:         { type: String, default: null },  // ngày tính lương; null = dùng `date`
  paidTeacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  paidTeacherName: { type: String, default: '' },
  paidRate:        { type: Number, default: null },
}, { timestamps: true });

// Tra nhanh "bản ghi của lớp trong ngày" (mỗi lớp mỗi ngày một bản — xem attendanceController.create).
teacherSessionSchema.index({ classId: 1, date: 1 });

module.exports = mongoose.model('TeacherSession', teacherSessionSchema);
