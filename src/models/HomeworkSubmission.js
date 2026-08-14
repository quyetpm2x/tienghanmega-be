const mongoose = require('mongoose');

// Bài nộp BTVN — mỗi lượt làm là 1 document riêng (giống TestAttempt), giữ lại
// lịch sử đầy đủ các lần làm khi assignment cho phép làm lại (maxAttempts > 1).
const homeworkSubmissionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeworkAssignment', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  attemptCount: { type: Number, default: 1 },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeworkQuestion' },
    // Câu hỏi cho phép nhiều dạng nộp (VD: video HOẶC viết) thì học sinh tự chọn 1
    // dạng để làm — answeredAs ghi lại đã chọn dạng nào, null = chưa chọn/chưa làm.
    // Câu chỉ có 1 answerType thì set sẵn = answerType đó, khỏi cần học sinh chọn.
    answeredAs: { type: String, enum: ['text', 'multiple_choice', 'video', 'audio', null], default: null },
    // Tuỳ answeredAs:
    selectedIndices: { type: [Number], default: [] },   // multiple_choice
    text: { type: String, default: '' },                 // text
    videoUrl: { type: String, default: '' },              // video
    audioUrl: { type: String, default: '' },              // audio
    points: { type: Number, default: 0 },                 // snapshot điểm TỐI ĐA của câu
    // Điểm THỰC NHẬN cuối cùng của câu — trắc nghiệm được set tự động ngay lúc nộp
    // bài (0 hoặc points), text/video/audio giữ null cho tới khi giảng viên chấm tay.
    // null = còn đang chờ chấm (dùng để tính pendingManualGrading).
    manualScore: { type: Number, default: null },
    // Nhận xét/giải thích của giảng viên khi chấm câu này — học sinh xem được ở
    // trang kết quả. Chỉ áp dụng cho câu chấm tay (text/video/audio).
    teacherNote: { type: String, default: '' },
  }],
  score: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  pendingManualGrading: { type: Boolean, default: false },
  tabSwitchCount: { type: Number, default: 0 },   // giống hệ Test — Page Visibility API
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null },
  autoSubmitted: { type: Boolean, default: false },
  disputeStatus: { type: String, enum: ['none', 'pending', 'responded', 'regraded'], default: 'none' },
  disputeMessages: [{
    from: { type: String, enum: ['student', 'teacher'], required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  // Mốc học sinh đã XEM — dùng để tính badge "có điểm mới"/"có phản hồi mới".
  studentSeenGradeAt: { type: Date, default: null },
  studentSeenDisputeReplyAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);
