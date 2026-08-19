const crypto = require('crypto');
const router = require('express').Router();
const PlacementSession = require('../models/PlacementSession');
const PlacementTest = require('../models/PlacementTest');
const TestQuestion = require('../models/TestQuestion');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { protect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày, không cấu hình qua UI

// Admin: tạo phiên test cho một lead — lead lấy từ Registration (registrationId)
// HOẶC nhập tay (name+phone); đề lấy cụ thể (testId) HOẶC random trong 1 pool
// (randomPool) — server tự chốt testId ngay lúc tạo, không random lại sau này.
router.post('/', protect, permit('tests.placementCreate'), async (req, res, next) => {
  const { registrationId, name, phone, email, testId, randomPool } = req.body;

  let leadName = name, leadPhone = phone, leadEmail = email || '';
  if (registrationId) {
    const reg = await Registration.findById(registrationId);
    if (!reg) return next(new AppError('Không tìm thấy đơn đăng ký', 404));
    leadName = reg.name; leadPhone = reg.phone; leadEmail = reg.email || '';
  }
  if (!leadName || !leadPhone) return next(new AppError('Vui lòng chọn lead từ Đơn đăng ký hoặc nhập tên/số điện thoại', 400));

  let resolvedTestId = testId;
  if (!resolvedTestId) {
    if (!Array.isArray(randomPool) || randomPool.length === 0) {
      return next(new AppError('Vui lòng chọn đề cụ thể hoặc ít nhất 1 đề cho pool random', 400));
    }
    const pool = await PlacementTest.find({ _id: { $in: randomPool } });
    if (pool.length === 0) return next(new AppError('Không tìm thấy đề nào trong pool đã chọn', 400));
    resolvedTestId = pool[Math.floor(Math.random() * pool.length)]._id;
  } else {
    const exists = await PlacementTest.findById(resolvedTestId);
    if (!exists) return next(new AppError('Không tìm thấy đề test', 404));
  }

  const token = crypto.randomBytes(24).toString('hex');
  const session = await PlacementSession.create({
    registrationId: registrationId || null,
    name: leadName, phone: leadPhone, email: leadEmail,
    testId: resolvedTestId, token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  success(res, session, 'Tạo phiên test thành công', 201);
});

// Admin: danh sách phiên — status tính runtime (không lưu field riêng để tránh
// lệch dữ liệu giữa lúc tạo và lúc query).
router.get('/', protect, permit('tests.placementView'), async (req, res) => {
  const { status } = req.query;
  // KHÔNG dùng .lean() ở đây: .lean() trả document thô, bỏ qua toàn bộ default
  // value của schema — với câu hỏi cũ trong ngân hàng thiếu sẵn field
  // questionType/proficiency (tạo trước khi các field này tồn tại), populate
  // dạng lean sẽ trả về undefined cho các field đó và làm hỏng UI chi tiết.
  // .toObject() áp dụng default đúng như route /topik-submissions đang làm.
  // populate đầy đủ testId.questions (không chỉ 'title') để FE liệt kê được
  // TẤT CẢ câu hỏi của đề, kể cả câu học viên chưa làm/không có trong
  // session.answers (VD đề bị admin sửa thêm câu sau khi học viên đã nộp bài).
  const sessions = await PlacementSession.find().sort({ createdAt: -1 })
    .populate({ path: 'testId', populate: { path: 'questions.questionId' } })
    .populate('registrationId', 'name phone')
    .populate('answers.questionId');
  const now = Date.now();
  const withStatus = sessions.map(s => {
    const obj = s.toObject();
    obj.status = s.usedAt ? 'completed' : (s.expiresAt.getTime() <= now ? 'expired' : 'pending');
    return obj;
  });
  success(res, status ? withStatus.filter(s => s.status === status) : withStatus);
});

// Admin: chấm tự luận + ghi kết quả xếp lớp
router.patch('/:id/review', protect, permit('tests.placementUpdate'), async (req, res, next) => {
  const { essayScore, essayFeedback, placementNote, markContacted } = req.body;
  const update = {};
  if (essayScore !== undefined) update.essayScore = essayScore;
  if (essayFeedback !== undefined) update.essayFeedback = essayFeedback;
  if (essayScore !== undefined || essayFeedback !== undefined) update.essayReviewStatus = 'reviewed';
  if (placementNote !== undefined) update.placementNote = placementNote;
  if (markContacted) update.contactedAt = new Date();
  const session = await PlacementSession.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!session) return next(new AppError('Không tìm thấy phiên test', 404));
  success(res, session, 'Cập nhật thành công');
});

// Admin: ghi lại liên kết Student thật đã tạo từ phiên này (Student được tạo
// riêng qua /admin/students — route này chỉ đánh dấu để tránh chuyển trùng).
router.patch('/:id/convert', protect, permit('tests.placementUpdate'), async (req, res, next) => {
  const { studentId } = req.body;
  if (!studentId) return next(new AppError('Thiếu studentId', 400));
  const session = await PlacementSession.findByIdAndUpdate(req.params.id, { convertedStudentId: studentId }, { new: true });
  if (!session) return next(new AppError('Không tìm thấy phiên test', 404));
  success(res, session, 'Cập nhật thành công');
});

// Public: khách TỰ tạo phiên (không cần admin gửi link trước) — CHỈ áp dụng
// cho đề đang bật showOnHomepage (khác hẳn route tạo phiên phía admin ở trên,
// vốn yêu cầu quyền + không giới hạn theo cờ này). Trả về token để FE chuyển
// thẳng sang /test-dau-vao/[token] — dùng lại nguyên vẹn luồng làm bài/nộp
// bài/token 1-lần/hết hạn 7 ngày đã có, không cần xây thêm 1 luồng riêng.
router.post('/public-start', async (req, res, next) => {
  const { name, phone, email, testId } = req.body;
  if (!name || !phone) return next(new AppError('Vui lòng nhập tên và số điện thoại', 400));
  const test = await PlacementTest.findOne({ _id: testId, showOnHomepage: true });
  if (!test) return next(new AppError('Đề test không khả dụng, vui lòng thử lại', 404));

  const token = crypto.randomBytes(24).toString('hex');
  const session = await PlacementSession.create({
    registrationId: null,
    name, phone, email: email || '',
    testId: test._id, token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  success(res, { token: session.token }, 'Tạo phiên test thành công', 201);
});

// Public: lấy đề theo token — không đăng nhập. Không lộ thông tin phiên khác.
router.get('/token/:token', async (req, res, next) => {
  const session = await PlacementSession.findOne({ token: req.params.token })
    .populate({ path: 'testId', populate: { path: 'questions.questionId' } });
  if (!session) return next(new AppError('Không tìm thấy bài test, vui lòng liên hệ MEGA để nhận link chính xác', 404));
  if (session.usedAt) return next(new AppError('Link này đã được sử dụng, vui lòng liên hệ MEGA để nhận link mới', 410));
  if (session.expiresAt.getTime() <= Date.now()) return next(new AppError('Link đã hết hạn, vui lòng liên hệ MEGA để nhận link mới', 410));
  success(res, { name: session.name, test: session.testId, expiresAt: session.expiresAt });
});

// Public: nộp bài theo token — tự chấm trắc nghiệm + breakdown theo proficiency,
// vô hiệu hoá token ngay (usedAt). Không tin điểm/kết quả từ client.
router.post('/token/:token/submit', async (req, res, next) => {
  const session = await PlacementSession.findOne({ token: req.params.token });
  if (!session) return next(new AppError('Không tìm thấy bài test', 404));
  if (session.usedAt) return next(new AppError('Link này đã được sử dụng', 410));
  if (session.expiresAt.getTime() <= Date.now()) return next(new AppError('Link đã hết hạn', 410));

  const { answers } = req.body;
  if (!Array.isArray(answers)) return next(new AppError('Thiếu dữ liệu bài làm', 400));

  const questionIds = answers.map(a => a.questionId);
  const questions = await TestQuestion.find({ _id: { $in: questionIds } });
  const qMap = new Map(questions.map(q => [String(q._id), q]));

  let mcCorrect = 0, mcTotal = 0, hasEssay = false;
  const breakdownMap = new Map(); // proficiency -> { correct, total }
  for (const a of answers) {
    const q = qMap.get(String(a.questionId));
    if (!q) continue;
    if (q.questionType === 'essay') { hasEssay = true; continue; }
    mcTotal++;
    const entry = breakdownMap.get(q.proficiency) || { correct: 0, total: 0 };
    entry.total++;
    const isCorrect = typeof a.selectedIndex === 'number' && q.answerIndices.includes(a.selectedIndex);
    if (isCorrect) { mcCorrect++; entry.correct++; }
    breakdownMap.set(q.proficiency, entry);
  }
  const mcBreakdown = Array.from(breakdownMap.entries()).map(([proficiency, v]) => ({ proficiency, ...v }));

  session.answers = answers;
  session.mcCorrect = mcCorrect;
  session.mcTotal = mcTotal;
  session.mcBreakdown = mcBreakdown;
  session.hasEssay = hasEssay;
  session.essayReviewStatus = hasEssay ? 'pending' : 'none';
  session.usedAt = new Date();
  await session.save();

  success(res, { done: true }, 'Nộp bài thành công', 201);
});

module.exports = router;
