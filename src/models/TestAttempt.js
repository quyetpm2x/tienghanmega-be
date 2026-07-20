const mongoose = require('mongoose');

// Bài làm của 1 học sinh trong 1 phiên thi. testId là đề CỤ THỂ đã được random
// riêng cho học sinh này (rút từ TestSession.activeTestIds lúc bắt đầu làm).
// questionOrder + mỗi answer.optionOrder lưu lại thứ tự đã xáo trộn cho lượt
// làm này — cần thiết để chấm đúng vị trí đã chọn và hiển thị lại y hệt lúc làm.
const testAttemptSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSession', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  testId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  questionOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion' }],
  answers: [{
    questionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    optionOrder:  [{ type: Number }],   // thứ tự index gốc của các đáp án sau khi xáo, VD [2,0,3,1]
    selectedIndices: { type: [Number], default: [] },   // các vị trí (theo optionOrder, tức đã xáo) học sinh chọn — có thể nhiều hơn 1
    // "Chụp" đáp án đúng (answerIndices, theo index gốc chưa xáo) + điểm của
    // câu hỏi này TRONG đề lúc bắt đầu làm — dùng để chấm điểm thay vì tra cứu
    // trực tiếp TestQuestion/Test lúc nộp bài, tránh việc admin sửa câu hỏi/đề
    // giữa lúc học sinh đang làm ảnh hưởng tới kết quả chấm. Không có default —
    // attempt tạo TRƯỚC khi có field này sẽ để trống, các nơi dùng đến sẽ tự
    // fallback về tra cứu trực tiếp như cách chấm cũ (xem utils/testScoring.resolveGrading).
    answerIndices: [{ type: Number }],
    points: { type: Number },
  }],
  score: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null },
  autoSubmitted: { type: Boolean, default: false },
  // Lần làm thứ mấy — mỗi lần làm lại (khi allowRetake) tạo 1 document MỚI với
  // attemptCount tăng dần, KHÔNG ghi đè lên document cũ, để giữ lại toàn bộ
  // lịch sử các lần làm cho admin/giáo viên xem lại theo từng lần.
  attemptCount: { type: Number, default: 1 },
  // Đánh dấu bài làm này đã bị giáo viên/admin đình chỉ giữa chừng — nếu đang
  // làm dở thì submittedAt cũng được set ngay lúc đình chỉ để khoá lại.
  disqualified: { type: Boolean, default: false },
}, { timestamps: true });

// 1 học sinh có thể có NHIỀU document cho cùng 1 phiên thi (mỗi lần làm lại là
// 1 document riêng, attemptCount khác nhau) — unique theo cả 3 field để chặn
// trùng lặp cùng 1 lần làm, không chặn làm lại (retake gate nằm ở application logic).
testAttemptSchema.index({ sessionId: 1, studentId: 1, attemptCount: 1 }, { unique: true });

module.exports = mongoose.model('TestAttempt', testAttemptSchema);
