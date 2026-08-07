const mongoose = require('mongoose');

// Một phiên = một link làm bài đầu vào gửi cho MỘT lead cụ thể (không có
// trang public tự do). Token dùng một lần: usedAt được set ngay khi nộp
// bài, mọi truy cập sau đó vào token này đều bị từ chối. expiresAt tính
// sẵn lúc tạo phiên (now + 7 ngày), không cấu hình được qua UI.
const placementSessionSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', default: null },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, default: '' },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlacementTest', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion' },
    selectedIndex: Number,
    textAnswer: String,
    imageAnswer: String,
    audioAnswer: String,
  }],
  mcCorrect: { type: Number, default: 0 },
  mcTotal: { type: Number, default: 0 },
  mcBreakdown: [{
    proficiency: String,
    correct: Number,
    total: Number,
  }],
  hasEssay: { type: Boolean, default: false },
  essayReviewStatus: { type: String, enum: ['none', 'pending', 'reviewed'], default: 'none' },
  essayScore: { type: Number, default: null },
  essayFeedback: { type: String, default: '' },
  contactedAt: { type: Date, default: null },
  placementNote: { type: String, default: '' },
  // Đã được admin chuyển thành 1 Student thật hay chưa — set khi bấm "Chuyển
  // thành học sinh" trên modal chi tiết phiên, tránh chuyển trùng lặp.
  convertedStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PlacementSession', placementSessionSchema);
