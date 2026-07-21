const Class = require('../models/Class');
const Test = require('../models/Test');
const TestSession = require('../models/TestSession');
const TestAttempt = require('../models/TestAttempt');
const TestQuestion = require('../models/TestQuestion');
const Student = require('../models/Student');
const { sameIndexSet, resolveGrading } = require('../utils/testScoring');
const { effectiveStatus } = require('../utils/testSessionStatus');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin-only: xem tổng quan mọi phiên kiểm tra + kết quả thi trên toàn hệ
// thống (không giới hạn theo lớp của 1 giáo viên như teacherTestController).

exports.getAllSessions = async (req, res) => {
  const sessions = await TestSession.find()
    .populate('classId', 'name')
    .populate('activeTestIds', 'title level duration')
    .sort({ createdAt: -1 });

  const counts = await TestAttempt.aggregate([
    { $match: { sessionId: { $in: sessions.map(s => s._id) } } },
    { $group: {
      _id: '$sessionId',
      submitted: { $sum: { $cond: [{ $ne: ['$submittedAt', null] }, 1, 0] } },
      avgScore: { $avg: { $cond: [{ $ne: ['$submittedAt', null] }, { $divide: ['$score', { $max: ['$totalPoints', 1] }] }, null] } },
    } },
  ]);
  const countMap = new Map(counts.map(c => [String(c._id), c]));

  success(res, sessions.map(s => {
    const c = countMap.get(String(s._id));
    return {
      ...s.toObject(),
      effectiveStatus: effectiveStatus(s),
      submittedCount: c?.submitted || 0,
      avgScorePercent: c?.avgScore != null ? Math.round(c.avgScore * 100) : null,
    };
  }));
};

// Admin tạo phiên kiểm tra: đặt tên phiên + chọn lớp + chọn đề (trong kho đề
// của lớp) đưa vào vòng random. Giờ mở/kết thúc/cho phép làm lại là TUỲ CHỌN
// ngay lúc tạo — nếu bỏ trống thì phiên ở trạng thái 'draft', giáo viên (hoặc
// admin) sẽ vào đặt sau; nếu điền luôn thì phiên mở ngay, không cần thêm bước.
// Đề không được đổi lại sau khi tạo.
exports.createSession = async (req, res, next) => {
  const { title, classId, activeTestIds, openAt, endAt, allowRetake } = req.body;
  if (!title?.trim()) return next(new AppError('Vui lòng nhập tên phiên kiểm tra', 400));
  if (!classId) return next(new AppError('Vui lòng chọn lớp', 400));
  const cls = await Class.findById(classId);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  if (!Array.isArray(activeTestIds) || activeTestIds.length === 0) {
    return next(new AppError('Vui lòng chọn ít nhất 1 đề cho phiên kiểm tra', 400));
  }
  if (endAt && openAt && new Date(endAt) <= new Date(openAt)) {
    return next(new AppError('Thời gian kết thúc phải sau thời gian bắt đầu', 400));
  }

  const pool = await Test.find({ assignedClassIds: classId }).select('_id');
  const poolIds = pool.map(t => String(t._id));
  const invalid = activeTestIds.some(id => !poolIds.includes(String(id)));
  if (invalid) return next(new AppError('Có đề không thuộc kho đề của lớp này', 400));

  const session = await TestSession.create({
    title: title.trim(), classId, poolTestIds: poolIds, activeTestIds,
    openAt: openAt || '', endAt: endAt || '', allowRetake: !!allowRetake,
    status: openAt ? (new Date(openAt) <= new Date() ? 'open' : 'pending') : 'draft',
  });
  success(res, session, 'Tạo phiên kiểm tra thành công', 201);
};

// Admin cũng có thể tự đặt giờ/mở phiên (giống giáo viên), sửa lại tên phiên,
// và thêm/bớt đề trong activeTestIds (chỉ admin được đổi đề — giáo viên không có quyền này).
exports.updateSession = async (req, res, next) => {
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  if (session.status === 'closed') return next(new AppError('Phiên kiểm tra đã đóng, không thể sửa', 400));

  const { title, activeTestIds, openAt, endAt, allowRetake } = req.body;
  if (!session.openAt && !openAt) return next(new AppError('Vui lòng chọn thời gian bắt đầu', 400));
  const nextOpenAt = openAt || session.openAt;
  if (endAt && new Date(endAt) <= new Date(nextOpenAt)) {
    return next(new AppError('Thời gian kết thúc phải sau thời gian bắt đầu', 400));
  }
  if (title !== undefined) {
    if (!title.trim()) return next(new AppError('Tên phiên kiểm tra không được để trống', 400));
    session.title = title.trim();
  }
  if (activeTestIds !== undefined) {
    if (!Array.isArray(activeTestIds) || activeTestIds.length === 0) {
      return next(new AppError('Vui lòng chọn ít nhất 1 đề cho phiên kiểm tra', 400));
    }
    const pool = await Test.find({ assignedClassIds: session.classId }).select('_id');
    const poolIds = pool.map(t => String(t._id));
    const invalid = activeTestIds.some(id => !poolIds.includes(String(id)));
    if (invalid) return next(new AppError('Có đề không thuộc kho đề của lớp này', 400));
    session.poolTestIds = poolIds;
    session.activeTestIds = activeTestIds;
  }
  if (openAt) {
    session.openAt = openAt;
    session.status = new Date(openAt) <= new Date() ? 'open' : 'pending';
  }
  if (endAt !== undefined) session.endAt = endAt;
  if (allowRetake !== undefined) session.allowRetake = !!allowRetake;
  await session.save();
  success(res, session, 'Cập nhật phiên kiểm tra thành công');
};

// Xoá phiên (chỉ khi chưa có học sinh nào làm bài) — dùng khi admin tạo nhầm
// lớp/đề trước khi giáo viên kịp đặt giờ, hoặc muốn dọn phiên cũ.
exports.deleteSession = async (req, res, next) => {
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const hasAttempts = await TestAttempt.exists({ sessionId: session._id });
  if (hasAttempts) return next(new AppError('Đã có học sinh làm bài trong phiên này, không thể xoá — hãy đóng phiên thay vì xoá', 400));
  await session.deleteOne();
  success(res, null, 'Đã xoá phiên kiểm tra');
};

// Toàn bộ học sinh của lớp — kể cả chưa làm/đang làm dở — để admin thấy đầy
// đủ trạng thái, không chỉ những em đã nộp bài.
exports.getSessionResults = async (req, res, next) => {
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));

  const students = await Student.find({ classId: session.classId }).select('name').sort({ name: 1 });
  // 1 học sinh có thể có nhiều attempt cho cùng phiên (mỗi lần làm lại là 1
  // document riêng) — gom theo studentId, lần mới nhất làm đại diện chính,
  // đồng thời giữ nguyên cả danh sách cho FE chọn xem theo từng lần.
  const attempts = await TestAttempt.find({ sessionId: session._id })
    .populate('testId', 'title level')
    .select('-questionOrder -answers.optionOrder')
    .sort({ attemptCount: 1 });
  const attemptsByStudent = new Map();
  for (const a of attempts) {
    const key = String(a.studentId);
    if (!attemptsByStudent.has(key)) attemptsByStudent.set(key, []);
    attemptsByStudent.get(key).push(a);
  }
  const disqualifiedSet = new Set(session.disqualifiedStudentIds.map(id => String(id)));

  const roster = students.map(s => {
    const list = attemptsByStudent.get(String(s._id)) || [];
    const a = list.length ? list[list.length - 1] : null;
    return {
      studentId: { _id: s._id, name: s.name },
      status: !a ? 'not_started' : a.submittedAt ? 'submitted' : 'in_progress',
      disqualified: disqualifiedSet.has(String(s._id)) || !!(a && a.disqualified),
      attemptId: a ? a._id : null,
      testId: a ? a.testId : null,
      score: a ? a.score : null,
      totalPoints: a ? a.totalPoints : null,
      attemptCount: a ? a.attemptCount : 0,
      submittedAt: a ? a.submittedAt : null,
      autoSubmitted: a ? a.autoSubmitted : false,
      tabSwitchCount: a ? a.tabSwitchCount : 0,
      pendingManualGrading: a ? a.pendingManualGrading : false,
      attempts: list.map(x => ({
        attemptId: x._id, attemptCount: x.attemptCount, testId: x.testId,
        score: x.score, totalPoints: x.totalPoints, submittedAt: x.submittedAt,
        autoSubmitted: x.autoSubmitted, disqualified: x.disqualified, tabSwitchCount: x.tabSwitchCount,
        pendingManualGrading: x.pendingManualGrading,
      })),
    };
  }).sort((x, y) => (y.score ?? -1) - (x.score ?? -1));

  success(res, roster);
};

// Đình chỉ / bỏ đình chỉ 1 học sinh cho phiên này (admin — không giới hạn theo
// lớp của 1 giáo viên). Có tác dụng ngay cả khi học sinh chưa bắt đầu làm bài.
exports.setDisqualified = async (req, res, next) => {
  const { studentId, disqualified } = req.body;
  if (!studentId) return next(new AppError('Thiếu studentId', 400));
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));

  const already = session.disqualifiedStudentIds.some(id => String(id) === String(studentId));
  if (disqualified && !already) session.disqualifiedStudentIds.push(studentId);
  if (!disqualified && already) session.disqualifiedStudentIds = session.disqualifiedStudentIds.filter(id => String(id) !== String(studentId));
  await session.save();

  if (disqualified) {
    const attempt = await TestAttempt.findOne({ sessionId: session._id, studentId });
    if (attempt) {
      attempt.disqualified = true;
      if (!attempt.submittedAt) attempt.submittedAt = new Date();
      await attempt.save();
    }
  }

  success(res, null, disqualified ? 'Đã đình chỉ thi học sinh' : 'Đã bỏ đình chỉ thi');
};

exports.getAttemptDetail = async (req, res, next) => {
  const attempt = await TestAttempt.findById(req.params.attemptId).populate('studentId', 'name').populate('testId', 'title level duration');
  if (!attempt) return next(new AppError('Không tìm thấy bài làm', 404));

  const questions = await TestQuestion.find({ _id: { $in: attempt.questionOrder } });
  const questionMap = new Map(questions.map(q => [String(q._id), q]));

  // Chỉ cần tra điểm "sống" từ Test cho các câu CHƯA có snapshot points (attempt cũ).
  const needsLivePoints = attempt.answers.some(a => typeof a.points !== 'number');
  const testPointsMap = needsLivePoints
    ? new Map((await Test.findById(attempt.testId._id).select('questions')).questions.map(q => [String(q.questionId), q.points]))
    : new Map();

  const detail = attempt.questionOrder.map(qid => {
    const q = questionMap.get(String(qid));
    const ans = attempt.answers.find(a => String(a.questionId) === String(qid));
    if (!q || !ans) return null;
    if (ans.questionType === 'essay') {
      return {
        questionId: q._id, questionType: 'essay', question: q.question, image: q.image, audioUrl: q.audioUrl,
        textAnswer: ans.textAnswer, imageAnswer: ans.imageAnswer, audioAnswer: ans.audioAnswer,
        manualScore: ans.manualScore, points: typeof ans.points === 'number' ? ans.points : (testPointsMap.get(String(qid)) || 0),
        explanation: q.explanation,
      };
    }
    const shuffledOptions = ans.optionOrder.map(i => q.options[i]);
    // Dùng lại đúng snapshot đã dùng để CHẤM điểm — tránh hiển thị "đáp án
    // đúng" khác với đáp án đã thực sự dùng để tính ra attempt.score.
    const { correctIndices, points } = resolveGrading(ans, q, testPointsMap.get(String(qid)));
    return {
      questionId: q._id,
      questionType: 'multiple_choice',
      question: q.question,
      image: q.image,
      audioUrl: q.audioUrl,
      options: shuffledOptions,
      selectedIndices: ans.selectedIndices,
      correctIndices,
      isCorrect: sameIndexSet(ans.selectedIndices, correctIndices),
      explanation: q.explanation,
      points,
    };
  }).filter(Boolean);

  success(res, {
    student: attempt.studentId,
    test: attempt.testId,
    score: attempt.score,
    totalPoints: attempt.totalPoints,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    autoSubmitted: attempt.autoSubmitted,
    tabSwitchCount: attempt.tabSwitchCount,
    pendingManualGrading: attempt.pendingManualGrading,
    questions: detail,
  });
};

// Chấm tay các câu tự luận trong 1 bài làm (admin — không giới hạn theo lớp
// của 1 giáo viên). Xem giải thích chi tiết ở bản giáo viên (teacherTestController.gradeAttempt).
exports.gradeAttempt = async (req, res, next) => {
  const attempt = await TestAttempt.findById(req.params.attemptId);
  if (!attempt) return next(new AppError('Không tìm thấy bài làm', 404));
  if (!attempt.submittedAt) return next(new AppError('Học sinh chưa nộp bài, chưa thể chấm', 400));

  const { grades } = req.body; // [{ questionId, score }]
  if (!Array.isArray(grades) || !grades.length) return next(new AppError('Thiếu dữ liệu chấm điểm', 400));
  const gradeMap = new Map(grades.map(g => [String(g.questionId), g.score]));

  const needsLiveLookup = attempt.answers.some(a => typeof a.points !== 'number' || (a.questionType !== 'essay' && (!Array.isArray(a.answerIndices) || a.answerIndices.length === 0)));
  const questions = needsLiveLookup ? await TestQuestion.find({ _id: { $in: attempt.questionOrder } }) : [];
  const qMap = new Map(questions.map(q => [String(q._id), q]));
  const test = needsLiveLookup ? await Test.findById(attempt.testId).select('questions') : null;
  const testPointsMap = test ? new Map(test.questions.map(q => [String(q.questionId), q.points])) : new Map();

  for (const a of attempt.answers) {
    if (a.questionType !== 'essay' || !gradeMap.has(String(a.questionId))) continue;
    const raw = Number(gradeMap.get(String(a.questionId)));
    const maxPoints = typeof a.points === 'number' ? a.points : (testPointsMap.get(String(a.questionId)) || 0);
    if (Number.isNaN(raw) || raw < 0 || raw > maxPoints) {
      return next(new AppError(`Điểm chấm không hợp lệ (0 - ${maxPoints})`, 400));
    }
  }

  let score = 0;
  let pendingManualGrading = false;
  attempt.answers = attempt.answers.map(a => {
    const obj = a.toObject();
    if (a.questionType === 'essay') {
      if (gradeMap.has(String(a.questionId))) obj.manualScore = Number(gradeMap.get(String(a.questionId)));
      if (obj.manualScore === null || obj.manualScore === undefined) pendingManualGrading = true;
      else score += obj.manualScore;
      return obj;
    }
    const { correctIndices, points } = resolveGrading(a, qMap.get(String(a.questionId)), testPointsMap.get(String(a.questionId)));
    if (sameIndexSet(a.selectedIndices, correctIndices)) score += points;
    return obj;
  });
  attempt.score = score;
  attempt.pendingManualGrading = pendingManualGrading;
  await attempt.save();

  success(res, { score: attempt.score, totalPoints: attempt.totalPoints, pendingManualGrading }, 'Đã lưu điểm chấm');
};
