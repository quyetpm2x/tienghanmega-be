const router = require('express').Router();
const TopikSubmission = require('../models/TopikSubmission');
const TestQuestion = require('../models/TestQuestion');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { protect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');
const { imageUpload, audioUpload, uploadToBlob } = require('../utils/uploadHandlers');

// Chống spam nhẹ — không cần thêm dependency: nhớ lần nộp bài gần nhất theo IP trong
// bộ nhớ, chặn nộp lại quá nhanh (thường 1 lượt thi mất vài chục phút, 20s là dư đủ
// để không chặn nhầm người dùng thật, chỉ chặn bot spam liên tục). Reset khi restart
// server — chấp nhận được vì đây chỉ là lớp chống spam thô, không phải bảo mật chính.
const lastSubmitByIp = new Map();
const SPAM_COOLDOWN_MS = 20 * 1000;

// Public: nộp bài — tự chấm phần trắc nghiệm ngay, phần tự luận (nếu có) chuyển
// essayReviewStatus='pending' để admin chấm tay sau (xem tab "Lượt làm bài").
router.post('/', async (req, res, next) => {
  const ip = req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '0.0.0.0';
  const lastAt = lastSubmitByIp.get(ip);
  if (lastAt && Date.now() - lastAt < SPAM_COOLDOWN_MS) {
    return next(new AppError('Bạn vừa nộp bài, vui lòng đợi ít phút rồi thử lại', 429));
  }

  const { name, phone, currentClass, testId, answers } = req.body;
  const email = (req.body.email || '').trim();
  if (!name || !name.trim() || name.trim().length < 2) return next(new AppError('Vui lòng nhập họ tên hợp lệ (tối thiểu 2 ký tự)', 400));
  if (!phone || !/^0\d{9}$/.test(String(phone).trim().replace(/\s/g, ''))) return next(new AppError('Số điện thoại không hợp lệ', 400));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return next(new AppError('Email không hợp lệ', 400));
  if (!testId || !Array.isArray(answers)) return next(new AppError('Thiếu dữ liệu bài làm', 400));

  lastSubmitByIp.set(ip, Date.now());

  const questionIds = answers.map(a => a.questionId);
  const questions = await TestQuestion.find({ _id: { $in: questionIds } });
  const qMap = new Map(questions.map(q => [String(q._id), q]));

  let mcCorrect = 0, mcTotal = 0, hasEssay = false;
  for (const a of answers) {
    const q = qMap.get(String(a.questionId));
    if (!q) continue;
    if (q.questionType === 'essay') { hasEssay = true; continue; }
    mcTotal++;
    if (typeof a.selectedIndex === 'number' && q.answerIndices.includes(a.selectedIndex)) mcCorrect++;
  }

  const submission = await TopikSubmission.create({
    name, phone, email, currentClass, testId, answers,
    mcCorrect, mcTotal, hasEssay,
    essayReviewStatus: hasEssay ? 'pending' : 'none',
  });
  success(res, submission, 'Nộp bài thành công', 201);
});

// Public: upload ảnh/audio đính kèm câu trả lời tự luận — folder riêng, KHÔNG qua
// protect (khác /admin/upload và /student-portal/upload/* vốn yêu cầu đăng nhập).
router.post('/upload', (req, res, next) => {
  const type = req.query.type === 'audio' ? 'audio' : 'image';
  const middleware = type === 'audio' ? audioUpload.single('audio') : imageUpload.single('image');
  middleware(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ success: false, message: 'Không có file nào được upload' });
    try {
      const url = await uploadToBlob(req.file, 'topik-answers', type === 'audio' ? '.mp3' : '');
      success(res, { url }, 'Upload thành công');
    } catch (e) { next(e); }
  });
});

// Admin: danh sách lượt làm bài + xem/chấm tự luận
router.get('/', protect, permit('tests.topikView'), async (req, res) => {
  const { essayReviewStatus } = req.query;
  const filter = {};
  if (essayReviewStatus) filter.essayReviewStatus = essayReviewStatus;
  const list = await TopikSubmission.find(filter).sort({ createdAt: -1 })
    .populate('testId', 'title')
    .populate('answers.questionId');
  success(res, list);
});

router.patch('/:id/review', protect, permit('tests.topikUpdate'), async (req, res, next) => {
  const { essayScore, essayFeedback, markContacted } = req.body;
  const update = {};
  if (essayScore !== undefined) update.essayScore = essayScore;
  if (essayFeedback !== undefined) update.essayFeedback = essayFeedback;
  if (essayScore !== undefined || essayFeedback !== undefined) update.essayReviewStatus = 'reviewed';
  if (markContacted) update.contactedAt = new Date();
  const sub = await TopikSubmission.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!sub) return next(new AppError('Không tìm thấy lượt làm bài', 404));
  success(res, sub, 'Cập nhật thành công');
});

module.exports = router;
