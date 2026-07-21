const Student = require('../models/Student');
const Test = require('../models/Test');
const TestQuestion = require('../models/TestQuestion');
const TestSession = require('../models/TestSession');
const TestAttempt = require('../models/TestAttempt');
const { sameIndexSet, resolveGrading } = require('../utils/testScoring');
const { effectiveStatus } = require('../utils/testSessionStatus');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Everything in this controller derives its scope from req.studentAccount
// (set by protectStudent) — a student only ever sees/writes their own attempts,
// scoped to the class they currently belong to (Student.classId).

// Đệm trễ cho phép khi nộp bài — bù thời gian request đi trên mạng, không tính
// là nộp muộn nếu lệch trong khoảng này.
const SUBMIT_GRACE_MS = 20 * 1000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function myClassId(req) {
  const student = await Student.findById(req.studentAccount.studentId._id).select('classId');
  return student?.classId || null;
}

// Danh sách phiên kiểm tra của lớp học sinh đang học, kèm trạng thái bài làm
// của chính học sinh đó (nếu đã bắt đầu/nộp bài).
exports.getMySessions = async (req, res) => {
  const classId = await myClassId(req);
  if (!classId) return success(res, []);
  const studentId = req.studentAccount.studentId._id;

  // Bỏ qua phiên 'draft' — admin mới tạo, giáo viên chưa đặt giờ nên học sinh
  // chưa cần thấy (chưa thể bắt đầu làm được).
  const sessions = await TestSession.find({ classId, status: { $ne: 'draft' } })
    .populate('activeTestIds', 'title level duration')
    .sort({ createdAt: -1 });

  // Có thể có nhiều attempt/session (mỗi lần làm lại là 1 document) — chỉ lấy
  // lần MỚI NHẤT để hiển thị trạng thái hiện tại cho học sinh.
  const attempts = await TestAttempt.find({ studentId, sessionId: { $in: sessions.map(s => s._id) } })
    .select('sessionId testId score totalPoints submittedAt autoSubmitted attemptCount startedAt pendingManualGrading')
    .sort({ attemptCount: 1 });
  const attemptMap = new Map(attempts.map(a => [String(a.sessionId), a]));

  // Cần thời lượng của đề đang làm dở để FE tự đếm ngược cạnh nút "Tiếp tục
  // làm bài" — chỉ tra cứu cho các attempt CHƯA nộp (đã nộp thì không cần).
  const inProgressTestIds = attempts.filter(a => !a.submittedAt).map(a => a.testId);
  const durationTests = inProgressTestIds.length
    ? await Test.find({ _id: { $in: inProgressTestIds } }).select('duration')
    : [];
  const durationMap = new Map(durationTests.map(t => [String(t._id), t.duration]));

  success(res, sessions.map(s => {
    const a = attemptMap.get(String(s._id));
    return {
      _id: s._id,
      title: s.title,
      activeTestIds: s.activeTestIds,
      openAt: s.openAt,
      endAt: s.endAt,
      allowRetake: s.allowRetake,
      effectiveStatus: effectiveStatus(s),
      myAttempt: a ? {
        _id: a._id,
        sessionId: a.sessionId,
        testId: a.testId,
        score: a.score,
        totalPoints: a.totalPoints,
        submittedAt: a.submittedAt,
        autoSubmitted: a.autoSubmitted,
        startedAt: a.startedAt,
        pendingManualGrading: a.pendingManualGrading,
        durationMin: !a.submittedAt ? (durationMap.get(String(a.testId)) ?? null) : null,
      } : null,
    };
  }));
};

// Bắt đầu (hoặc tiếp tục) làm bài — mỗi học sinh được random 1 đề riêng từ
// danh sách đề giáo viên đã kích hoạt cho phiên này. Không trả về đáp án đúng.
exports.startAttempt = async (req, res, next) => {
  const classId = await myClassId(req);
  const studentId = req.studentAccount.studentId._id;
  const session = await TestSession.findById(req.params.sessionId).populate('activeTestIds');
  if (!session || !classId || String(session.classId) !== String(classId)) {
    return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  }
  if (effectiveStatus(session) !== 'open') {
    return next(new AppError('Phiên kiểm tra chưa mở hoặc đã đóng', 400));
  }
  if (session.disqualifiedStudentIds.some(id => String(id) === String(studentId))) {
    return next(new AppError('Bạn đã bị đình chỉ thi, không thể làm bài kiểm tra này', 403));
  }
  if (!session.activeTestIds.length) return next(new AppError('Phiên kiểm tra chưa có đề nào', 400));

  // Lấy attempt MỚI NHẤT (nếu có) — lịch sử các lần làm trước vẫn giữ nguyên
  // thành các document riêng, không bị đụng tới.
  let attempt = await TestAttempt.findOne({ sessionId: session._id, studentId }).sort({ attemptCount: -1 });

  let nextAttemptCount = 1;
  if (attempt && attempt.submittedAt) {
    if (!session.allowRetake) return next(new AppError('Bạn đã làm bài kiểm tra này rồi', 400));
    nextAttemptCount = (attempt.attemptCount || 1) + 1;
    attempt = null; // sẽ tạo attempt MỚI (không ghi đè) để giữ lại lần làm trước trong lịch sử
  }

  let test, questionOrder;
  if (attempt) {
    // đang làm dở — tiếp tục đúng attempt đó
    test = await Test.findById(attempt.testId);
    questionOrder = attempt.questionOrder;
  } else {
    const pickedTest = session.activeTestIds[Math.floor(Math.random() * session.activeTestIds.length)];
    const fullTest = await Test.findById(pickedTest._id);
    questionOrder = shuffle(fullTest.questions.map(q => q.questionId));
    const questions = await TestQuestion.find({ _id: { $in: questionOrder } });
    const qMap = new Map(questions.map(q => [String(q._id), q]));
    const testPointsMap = new Map(fullTest.questions.map(q => [String(q.questionId), q.points]));
    // Chụp lại đáp án đúng + điểm của từng câu NGAY lúc bắt đầu làm — dùng để
    // chấm điểm sau này thay vì tra cứu lại TestQuestion/Test lúc nộp bài, để
    // việc admin sửa câu hỏi/đề giữa lúc học sinh đang làm không ảnh hưởng điểm.
    const answers = questionOrder.map(qid => {
      const q = qMap.get(String(qid));
      const isEssay = q.questionType === 'essay';
      return {
        questionId: qid,
        questionType: q.questionType,
        optionOrder: isEssay ? [] : shuffle(q.options.map((_, i) => i)),
        selectedIndices: [],
        answerIndices: isEssay ? [] : q.answerIndices,
        points: testPointsMap.get(String(qid)) || 0,
        textAnswer: '', imageAnswer: '', audioAnswer: '', manualScore: null,
      };
    });
    const totalPoints = fullTest.questions.reduce((s, q) => s + q.points, 0);

    attempt = await TestAttempt.create({
      sessionId: session._id, studentId, testId: fullTest._id,
      questionOrder, answers, score: 0, totalPoints, startedAt: new Date(), submittedAt: null, autoSubmitted: false,
      attemptCount: nextAttemptCount,
    });
    test = fullTest;
  }

  const questions = await TestQuestion.find({ _id: { $in: questionOrder } });
  const qMap = new Map(questions.map(q => [String(q._id), q]));
  const answerMap = new Map(attempt.answers.map(a => [String(a.questionId), a]));

  const durationMs = test.duration * 60 * 1000;
  const remainingMs = Math.max(0, durationMs - (Date.now() - new Date(attempt.startedAt).getTime()));

  success(res, {
    attemptId: attempt._id,
    testTitle: test.title,
    duration: test.duration,
    startedAt: attempt.startedAt,
    remainingMs,
    questions: attempt.questionOrder.map(qid => {
      const q = qMap.get(String(qid));
      const a = answerMap.get(String(qid));
      if (a.questionType === 'essay') {
        return {
          questionId: qid, questionType: 'essay', question: q.question, image: q.image, audioUrl: q.audioUrl,
          points: a.points,
          textAnswer: a.textAnswer, imageAnswer: a.imageAnswer, audioAnswer: a.audioAnswer,
        };
      }
      return {
        questionId: qid, questionType: 'multiple_choice', question: q.question, image: q.image, audioUrl: q.audioUrl,
        points: a.points,
        options: a.optionOrder.map(i => q.options[i]),
        selectedIndices: a.selectedIndices,
        isMultiple: q.answerIndices.length > 1,
      };
    }),
  });
};

// Nộp bài — chấm điểm tự động (trắc nghiệm 100%), khoá lại (không sửa được nữa).
exports.submitAttempt = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const attempt = await TestAttempt.findById(req.params.attemptId);
  if (!attempt || String(attempt.studentId) !== String(studentId)) {
    return next(new AppError('Không tìm thấy bài làm', 404));
  }
  if (attempt.submittedAt) return next(new AppError('Bài làm đã được nộp trước đó', 400));

  const test = await Test.findById(attempt.testId);

  // Chặn gian lận "tắt/bỏ qua bộ đếm giờ trên trình duyệt rồi gọi thẳng API để
  // có thêm thời gian tra đáp án" — server tự tính lại hạn nộp từ startedAt +
  // thời lượng đề (+ đệm trễ mạng), KHÔNG tin vào đồng hồ phía client. Nộp
  // trong hạn: chấm theo answers vừa gửi lên (như cũ). Nộp trễ: BỎ QUA answers
  // gửi lên lúc này (có thể đã được chỉnh sửa thêm sau khi hết giờ), chỉ chấm
  // theo answers đã lưu tạm (autosave) gần nhất trước đó — xem exports.saveProgress.
  const deadlineMs = new Date(attempt.startedAt).getTime() + test.duration * 60 * 1000 + SUBMIT_GRACE_MS;
  const isLate = Date.now() > deadlineMs;
  const { answers, autoSubmitted } = req.body;

  // Chỉ cần tra cứu câu hỏi/đề "sống" cho các câu CHƯA có snapshot đáp án+điểm
  // (attempt tạo trước khi có cơ chế snapshot) — trường hợp bình thường sau
  // migration không cần query thêm.
  const needsLiveLookup = attempt.answers.some(a => typeof a.points !== 'number' || !Array.isArray(a.answerIndices) || a.answerIndices.length === 0);
  const questions = needsLiveLookup ? await TestQuestion.find({ _id: { $in: attempt.questionOrder } }) : [];
  const qMap = new Map(questions.map(q => [String(q._id), q]));
  const testPointsMap = needsLiveLookup ? new Map(test.questions.map(q => [String(q.questionId), q.points])) : new Map();

  let score = 0;
  let pendingManualGrading = false;
  attempt.answers = attempt.answers.map(a => {
    const submitted = (answers || []).find(x => String(x.questionId) === String(a.questionId));
    // Câu tự luận: không chấm tự động, chỉ lưu lại nội dung học sinh nộp (giữ
    // nguyên bản autosave gần nhất nếu nộp trễ). Điểm chờ giáo viên/admin chấm
    // tay qua exports.gradeAttempt — chưa cộng vào score lúc này.
    if (a.questionType === 'essay') {
      const obj = a.toObject();
      if (!isLate && submitted) {
        obj.textAnswer = submitted.textAnswer || '';
        obj.imageAnswer = submitted.imageAnswer || '';
        obj.audioAnswer = submitted.audioAnswer || '';
      }
      if (obj.manualScore === null || obj.manualScore === undefined) pendingManualGrading = true;
      else score += obj.manualScore;
      return obj;
    }
    const selectedIndices = isLate ? (a.selectedIndices || []) : (submitted?.selectedIndices || []);
    const { correctIndices, points } = resolveGrading(a, qMap.get(String(a.questionId)), testPointsMap.get(String(a.questionId)));
    if (sameIndexSet(selectedIndices, correctIndices)) score += points;
    return { ...a.toObject(), selectedIndices };
  });
  attempt.score = score;
  attempt.pendingManualGrading = pendingManualGrading;
  attempt.submittedAt = new Date();
  attempt.autoSubmitted = isLate ? true : !!autoSubmitted;
  await attempt.save();

  success(res, { score: attempt.score, totalPoints: attempt.totalPoints }, 'Nộp bài thành công');
};

// Tự động lưu tạm đáp án đang làm dở (KHÔNG chấm điểm, KHÔNG khoá bài) — làm
// "điểm neo" để nếu học sinh nộp trễ (bị submitAttempt bỏ qua answers gửi lúc
// đó), vẫn còn dữ liệu gần nhất để chấm thay vì mất trắng công sức đã làm.
exports.saveProgress = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const attempt = await TestAttempt.findById(req.params.attemptId);
  if (!attempt || String(attempt.studentId) !== String(studentId)) {
    return next(new AppError('Không tìm thấy bài làm', 404));
  }
  if (attempt.submittedAt) return next(new AppError('Bài làm đã được nộp trước đó', 400));

  const { answers } = req.body;
  const answerMap = new Map((answers || []).map(a => [String(a.questionId), a]));
  attempt.answers = attempt.answers.map(a => {
    const obj = a.toObject();
    const incoming = answerMap.get(String(a.questionId));
    if (!incoming) return obj;
    if (a.questionType === 'essay') {
      if (incoming.textAnswer !== undefined) obj.textAnswer = incoming.textAnswer || '';
      if (incoming.imageAnswer !== undefined) obj.imageAnswer = incoming.imageAnswer || '';
      if (incoming.audioAnswer !== undefined) obj.audioAnswer = incoming.audioAnswer || '';
    } else if (incoming.selectedIndices !== undefined) {
      obj.selectedIndices = incoming.selectedIndices;
    }
    return obj;
  });
  await attempt.save();
  success(res, null, 'Đã lưu tạm');
};

// Ghi nhận 1 lần học sinh rời khỏi màn hình làm bài (chuyển tab, thu nhỏ trình
// duyệt...) — client tự phát hiện qua Page Visibility API, gọi 1 lần mỗi khi
// quay lại màn hình sau khi đã rời đi. Chỉ tăng số đếm, không chặn/khoá bài.
exports.reportTabSwitch = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const attempt = await TestAttempt.findOne({ _id: req.params.attemptId, studentId, submittedAt: null });
  if (!attempt) return next(new AppError('Không tìm thấy bài làm', 404));
  await TestAttempt.updateOne({ _id: attempt._id }, { $inc: { tabSwitchCount: 1 } });
  success(res, null, 'Đã ghi nhận');
};

// Xem lại bài làm đã nộp — kèm đáp án đúng + giải thích.
exports.getAttemptReview = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const attempt = await TestAttempt.findById(req.params.attemptId).populate('testId', 'title level duration');
  if (!attempt || String(attempt.studentId) !== String(studentId)) {
    return next(new AppError('Không tìm thấy bài làm', 404));
  }
  if (!attempt.submittedAt) return next(new AppError('Bài làm chưa được nộp', 400));

  const questions = await TestQuestion.find({ _id: { $in: attempt.questionOrder } });
  const qMap = new Map(questions.map(q => [String(q._id), q]));

  // Chỉ cần tra điểm "sống" từ Test cho các câu CHƯA có snapshot points (attempt cũ).
  const needsLivePoints = attempt.answers.some(a => typeof a.points !== 'number');
  const testPointsMap = needsLivePoints
    ? new Map((await Test.findById(attempt.testId._id).select('questions')).questions.map(q => [String(q.questionId), q.points]))
    : new Map();

  const detail = attempt.questionOrder.map(qid => {
    const q = qMap.get(String(qid));
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
    const options = ans.optionOrder.map(i => q.options[i]);
    // Dùng lại đúng snapshot đã dùng để CHẤM điểm (resolveGrading) — tránh hiển
    // thị "đáp án đúng" khác với đáp án đã thực sự dùng để tính ra attempt.score.
    const { correctIndices, points } = resolveGrading(ans, q, testPointsMap.get(String(qid)));
    return {
      questionId: q._id, questionType: 'multiple_choice', question: q.question, image: q.image, audioUrl: q.audioUrl,
      options, selectedIndices: ans.selectedIndices, correctIndices,
      isCorrect: sameIndexSet(ans.selectedIndices, correctIndices), explanation: q.explanation, points,
    };
  }).filter(Boolean);

  success(res, {
    test: attempt.testId, score: attempt.score, totalPoints: attempt.totalPoints,
    startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, autoSubmitted: attempt.autoSubmitted,
    pendingManualGrading: attempt.pendingManualGrading,
    questions: detail,
  });
};
