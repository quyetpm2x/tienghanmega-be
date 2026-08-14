const mongoose = require('mongoose');

// 1 lượt giao bài cho 1 lớp (hoặc 1 nhóm học sinh trong lớp), gắn theo buổi học
// (lessonDate khớp field `date` của StudentAttendance — cùng khái niệm "buổi học").
// questions chụp lại tại thời điểm giao — sửa HomeworkQuestion gốc sau đó KHÔNG
// ảnh hưởng bài đã giao (giống TestSession.activeTestIds).
const homeworkAssignmentSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  lessonDate: { type: String, required: true },
  paperId: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeworkPaper', default: null },
  questions: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeworkQuestion', required: true },
    order: { type: Number, required: true },
  }],
  // Rỗng = giao cho CẢ LỚP (không bị ảnh hưởng nếu sau này có học sinh mới vào
  // lớp). Có giá trị = CHỈ những học sinh này thấy/làm được.
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  openAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  timerMinutes: { type: Number, default: null },   // null = không giới hạn giờ mỗi lượt làm
  maxAttempts: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('HomeworkAssignment', homeworkAssignmentSchema);
