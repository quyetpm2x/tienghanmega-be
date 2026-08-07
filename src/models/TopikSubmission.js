const mongoose = require('mongoose');

// 1 lượt làm bài Topik công khai — vừa là bài làm vừa là lead marketing (tên/SĐT/email).
const topikSubmissionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  currentClass: { type: String, default: '', trim: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TopikTest', required: true },
  answers: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestQuestion', required: true },
    selectedIndex: { type: Number, default: null },
    textAnswer:  { type: String, default: '' },
    imageAnswer: { type: String, default: '' },
    audioAnswer: { type: String, default: '' },
  }],
  mcCorrect: { type: Number, default: 0 },
  mcTotal:   { type: Number, default: 0 },
  hasEssay:  { type: Boolean, default: false },
  essayReviewStatus: { type: String, enum: ['none', 'pending', 'reviewed'], default: 'none' },
  essayScore:    { type: Number, default: null },
  essayFeedback: { type: String, default: '' },
  contactedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('TopikSubmission', topikSubmissionSchema);
