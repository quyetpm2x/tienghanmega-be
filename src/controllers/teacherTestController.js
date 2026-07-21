const Class = require('../models/Class');
const Student = require('../models/Student');
const Test = require('../models/Test');
const TestSession = require('../models/TestSession');
const TestAttempt = require('../models/TestAttempt');
const TestQuestion = require('../models/TestQuestion');
const { sameIndexSet, resolveGrading } = require('../utils/testScoring');
const { effectiveStatus } = require('../utils/testSessionStatus');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Giáo viên chỉ được thao tác trên các lớp mình dạy — mọi hàm bên dưới đều
// xác nhận lại quyền sở hữu lớp qua Class.teacherId trước khi đọc/ghi.
async function assertOwnClass(teacherId, classId) {
  const cls = await Class.findOne({ _id: classId, teacherId });
  if (!cls) return null;
  return cls;
}

exports.getSessions = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const myClasses = await Class.find({ teacherId }).select('_id name');
  const classIds = myClasses.map(c => c._id);
  const filter = { classId: { $in: classIds } };
  if (req.query.classId) filter.classId = req.query.classId;
  const sessions = await TestSession.find(filter)
    .populate('poolTestIds', 'title level duration')
    .populate('activeTestIds', 'title level duration')
    .populate('classId', 'name')
    .sort({ createdAt: -1 });
  success(res, sessions.map(s => ({ ...s.toObject(), effectiveStatus: effectiveStatus(s) })));
};

exports.getSession = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const session = await TestSession.findById(req.params.id)
    .populate('poolTestIds', 'title level duration')
    .populate('activeTestIds', 'title level duration')
    .populate('classId', 'name');
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId._id || session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  success(res, { ...session.toObject(), effectiveStatus: effectiveStatus(session) });
};

// Giáo viên KHÔNG được chọn/đổi đề — chỉ đặt giờ (openAt/endAt/allowRetake)
// cho phiên admin đã tạo sẵn (chọn lớp + chọn đề). Nếu phiên đang ở 'draft'
// (chưa từng có openAt), lần đặt giờ đầu tiên này chính là thao tác "mở phiên".
exports.updateSession = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  if (session.status === 'closed') return next(new AppError('Phiên kiểm tra đã đóng, không thể sửa', 400));

  const { openAt, endAt, allowRetake } = req.body;
  if (!session.openAt && !openAt) return next(new AppError('Vui lòng chọn thời gian bắt đầu', 400));
  const nextOpenAt = openAt || session.openAt;
  if (endAt && new Date(endAt) <= new Date(nextOpenAt)) {
    return next(new AppError('Thời gian kết thúc phải sau thời gian bắt đầu', 400));
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

exports.closeSession = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  session.status = 'closed';
  session.closedAt = new Date().toISOString();
  await session.save();
  success(res, session, 'Đã đóng phiên kiểm tra');
};

// Mở lại phiên đã đóng (đóng thủ công hoặc tự đóng do hết endAt) — status tính
// lại theo openAt cũ; nếu endAt cũ đã qua thì xoá luôn (không thì mở xong lại
// đóng ngay lập tức), giáo viên có thể sửa lại giờ kết thúc mới sau đó.
exports.reopenSession = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  if (effectiveStatus(session) !== 'closed') return next(new AppError('Phiên kiểm tra chưa đóng', 400));
  session.status = new Date(session.openAt) <= new Date() ? 'open' : 'pending';
  session.closedAt = '';
  if (session.endAt && new Date(session.endAt) <= new Date()) session.endAt = '';
  await session.save();
  success(res, session, 'Đã mở lại phiên kiểm tra');
};

// Bảng điểm học sinh đã làm trong 1 phiên kiểm tra.
// Toàn bộ học sinh của lớp — kể cả chưa làm/đang làm dở — để giáo viên thấy
// đầy đủ trạng thái, không chỉ những em đã nộp bài.
exports.getSessionResults = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));

  const students = await Student.find({ classId: session.classId }).select('name').sort({ name: 1 });
  // 1 học sinh có thể có nhiều attempt cho cùng phiên (mỗi lần làm lại là 1
  // document riêng) — gom theo studentId, sắp theo attemptCount để lấy lần mới
  // nhất làm đại diện chính, đồng thời giữ nguyên cả danh sách cho FE chọn xem theo từng lần.
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

// Đình chỉ / bỏ đình chỉ 1 học sinh cho phiên này. Đình chỉ có tác dụng ngay
// cả khi học sinh chưa bắt đầu làm (chặn trước) — nếu đang làm dở thì buộc
// kết thúc luôn bài đó (khoá lại, không cho nộp/tiếp tục nữa).
exports.setDisqualified = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { studentId, disqualified } = req.body;
  if (!studentId) return next(new AppError('Thiếu studentId', 400));
  const session = await TestSession.findById(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy phiên kiểm tra', 404));

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

// Chi tiết bài làm của 1 học sinh — câu hỏi theo đúng thứ tự đã xáo trộn cho
// học sinh đó, kèm đáp án đã chọn, đáp án đúng và giải thích để giáo viên xem lại.
exports.getAttemptDetail = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const attempt = await TestAttempt.findById(req.params.attemptId).populate('studentId', 'name').populate('testId', 'title level duration');
  if (!attempt) return next(new AppError('Không tìm thấy bài làm', 404));
  const session = await TestSession.findById(attempt.sessionId);
  if (!session) return next(new AppError('Không tìm thấy bài làm', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy bài làm', 404));

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

// Chấm tay các câu tự luận trong 1 bài làm — nhận danh sách {questionId, score},
// ghi đè manualScore cho từng câu, rồi tính lại TOÀN BỘ điểm attempt (trắc
// nghiệm chấm lại qua resolveGrading như cũ, tự luận cộng thẳng manualScore đã
// chấm) để đảm bảo score luôn nhất quán dù chấm nhiều lần/sửa điểm.
exports.gradeAttempt = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const attempt = await TestAttempt.findById(req.params.attemptId);
  if (!attempt) return next(new AppError('Không tìm thấy bài làm', 404));
  const session = await TestSession.findById(attempt.sessionId);
  if (!session) return next(new AppError('Không tìm thấy bài làm', 404));
  const owns = await assertOwnClass(teacherId, session.classId);
  if (!owns) return next(new AppError('Không tìm thấy bài làm', 404));
  if (!attempt.submittedAt) return next(new AppError('Học sinh chưa nộp bài, chưa thể chấm', 400));

  const { grades } = req.body; // [{ questionId, score }]
  if (!Array.isArray(grades) || !grades.length) return next(new AppError('Thiếu dữ liệu chấm điểm', 400));
  const gradeMap = new Map(grades.map(g => [String(g.questionId), g.score]));

  const needsLiveLookup = attempt.answers.some(a => typeof a.points !== 'number' || (a.questionType !== 'essay' && (!Array.isArray(a.answerIndices) || a.answerIndices.length === 0)));
  const questions = needsLiveLookup ? await TestQuestion.find({ _id: { $in: attempt.questionOrder } }) : [];
  const qMap = new Map(questions.map(q => [String(q._id), q]));
  const test = needsLiveLookup ? await Test.findById(attempt.testId).select('questions') : null;
  const testPointsMap = test ? new Map(test.questions.map(q => [String(q.questionId), q.points])) : new Map();

  // Validate điểm chấm hợp lệ TRƯỚC khi ghi đè — tránh ghi nửa chừng nếu có câu điểm sai.
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
