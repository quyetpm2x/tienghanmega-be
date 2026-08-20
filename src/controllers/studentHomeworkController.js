const Student = require('../models/Student');
const HomeworkAssignment = require('../models/HomeworkAssignment');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Đệm trễ cho phép khi nộp bài — bù thời gian request đi trên mạng (giống hệ Test).
const SUBMIT_GRACE_MS = 20 * 1000;

async function myClassId(req) {
  const student = await Student.findById(req.studentAccount.studentId._id).select('classId');
  return student?.classId || null;
}

function eligibleFor(assignment, studentId) {
  return assignment.studentIds.length === 0 || assignment.studentIds.some(id => String(id) === String(studentId));
}

// Danh sách BTVN của lớp học sinh, kèm trạng thái làm bài mới nhất của chính mình.
exports.getAssignments = async (req, res) => {
  const classId = await myClassId(req);
  if (!classId) return success(res, []);
  const studentId = req.studentAccount.studentId._id;
  const assignments = await HomeworkAssignment.find({ classId }).sort({ openAt: -1 });
  const visible = assignments.filter(a => eligibleFor(a, studentId));
  const submissions = await HomeworkSubmission.find({
    assignmentId: { $in: visible.map(a => a._id) }, studentId,
  }).select('-answers').sort({ attemptCount: 1 });
  const subMap = new Map();
  for (const s of submissions) subMap.set(String(s.assignmentId), s); // giữ lần cuối cùng (mới nhất)
  success(res, visible.map(a => ({
    _id: a._id, classId: a.classId, lessonDate: a.lessonDate, openAt: a.openAt, endAt: a.endAt,
    timerMinutes: a.timerMinutes, maxAttempts: a.maxAttempts, questionCount: a.questions.length,
    mySubmission: subMap.get(String(a._id)) || null,
  })));
};

exports.startAssignment = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const assignment = await HomeworkAssignment.findById(req.params.id).populate('questions.questionId');
  if (!assignment) return next(new AppError('Không tìm thấy bài tập', 404));
  if (!eligibleFor(assignment, studentId)) return next(new AppError('Bạn không được giao bài tập này', 403));
  const now = Date.now();
  if (now < new Date(assignment.openAt).getTime()) return next(new AppError('Bài tập chưa mở', 400));
  if (now > new Date(assignment.endAt).getTime()) return next(new AppError('Bài tập đã hết hạn nộp', 400));

  let sub = await HomeworkSubmission.findOne({ assignmentId: assignment._id, studentId, submittedAt: null });
  if (!sub) {
    const doneCount = await HomeworkSubmission.countDocuments({ assignmentId: assignment._id, studentId, submittedAt: { $ne: null } });
    if (doneCount >= assignment.maxAttempts) return next(new AppError('Bạn đã dùng hết số lần làm bài', 400));
    const totalPoints = assignment.questions.reduce((s, q) => s + (q.questionId.points || 0), 0);
    sub = await HomeworkSubmission.create({
      assignmentId: assignment._id, studentId, attemptCount: doneCount + 1,
      answers: assignment.questions.map(q => ({ questionId: q.questionId._id, points: q.questionId.points || 0 })),
      totalPoints, startedAt: new Date(),
    });
  }
  // Nếu đang tiếp tục 1 bài làm dở (sub đã tồn tại từ trước), trả kèm đáp án đã lưu
  // tạm (sub.answers) để FE khôi phục đúng trạng thái — không được để học sinh mất
  // công đã làm khi thoát rồi vào lại (giống hệt startAttempt hệ Test).
  const answerMap = new Map(sub.answers.map(a => [String(a.questionId), a]));
  success(res, {
    submissionId: sub._id,
    startedAt: sub.startedAt,
    timerMinutes: assignment.timerMinutes,
    endAt: assignment.endAt,
    tabSwitchCount: sub.tabSwitchCount,
    questions: assignment.questions.map(q => {
      const a = answerMap.get(String(q.questionId._id));
      return {
        questionId: q.questionId._id, question: q.questionId.question, youtubeUrl: q.questionId.youtubeUrl,
        image: q.questionId.image, audioUrl: q.questionId.audioUrl, answerTypes: q.questionId.answerTypes,
        options: q.questionId.options, points: q.questionId.points,
        // Dạng học sinh đã chọn để làm câu này (nếu câu cho phép nhiều dạng và đã
        // chọn từ trước) — để FE khôi phục đúng UI khi tiếp tục làm dở.
        answeredAs: a?.answeredAs || null,
        // Tiền tố "answer" để phân biệt với audioUrl ở trên (âm thanh của ĐỀ BÀI, không
        // phải bài học sinh đã nộp/lưu tạm).
        selectedIndices: a?.selectedIndices || [], text: a?.text || '', answerVideoUrl: a?.videoUrl || '', answerAudioUrl: a?.audioUrl || '', answerImageUrl: a?.imageUrl || '',
      };
    }),
  });
};

exports.saveProgress = async (req, res, next) => {
  const sub = await HomeworkSubmission.findOne({ _id: req.params.id, studentId: req.studentAccount.studentId._id, submittedAt: null });
  if (!sub) return next(new AppError('Không tìm thấy bài làm', 404));
  const { answers } = req.body;
  const answerMap = new Map((answers || []).map(a => [String(a.questionId), a]));
  sub.answers = sub.answers.map(a => {
    const obj = a.toObject();
    const incoming = answerMap.get(String(a.questionId));
    if (!incoming) return obj;
    if (incoming.answeredAs !== undefined) obj.answeredAs = incoming.answeredAs;
    if (incoming.selectedIndices !== undefined) obj.selectedIndices = incoming.selectedIndices;
    if (incoming.text !== undefined) obj.text = incoming.text;
    if (incoming.videoUrl !== undefined) obj.videoUrl = incoming.videoUrl;
    if (incoming.audioUrl !== undefined) obj.audioUrl = incoming.audioUrl;
    if (incoming.imageUrl !== undefined) obj.imageUrl = incoming.imageUrl;
    return obj;
  });
  await sub.save();
  success(res, null, 'Đã lưu tạm');
};

// Nộp bài — trắc nghiệm chấm tự động NGAY (set manualScore = 0 hoặc points), các
// dạng khác giữ manualScore null chờ giảng viên chấm tay (xem teacherHomeworkController.gradeSubmission).
// Câu cho phép nhiều answerTypes thì dựa vào answeredAs (dạng học sinh ĐÃ CHỌN để làm)
// để biết chấm tự động hay chờ chấm tay — không phải cấu hình answerTypes của câu hỏi.
exports.submitAssignment = async (req, res, next) => {
  const sub = await HomeworkSubmission.findOne({ _id: req.params.id, studentId: req.studentAccount.studentId._id });
  if (!sub) return next(new AppError('Không tìm thấy bài làm', 404));
  if (sub.submittedAt) return next(new AppError('Bài làm đã được nộp trước đó', 400));
  const assignment = await HomeworkAssignment.findById(sub.assignmentId).populate('questions.questionId');
  const deadlineMs = assignment.timerMinutes
    ? new Date(sub.startedAt).getTime() + assignment.timerMinutes * 60 * 1000 + SUBMIT_GRACE_MS
    : new Date(assignment.endAt).getTime() + SUBMIT_GRACE_MS;
  const isLate = Date.now() > deadlineMs;
  const { answers, autoSubmitted } = req.body;
  const answerMap = new Map((answers || []).map(a => [String(a.questionId), a]));
  const qMap = new Map(assignment.questions.map(q => [String(q.questionId._id), q.questionId]));

  sub.answers = sub.answers.map(a => {
    const obj = a.toObject();
    const incoming = isLate ? null : answerMap.get(String(a.questionId));
    const q = qMap.get(String(a.questionId));
    // Câu chỉ có đúng 1 dạng cho phép thì khỏi cần học sinh tự chọn — luôn chốt
    // đúng dạng đó. Câu nhiều dạng thì lấy answeredAs học sinh đã chọn (phải nằm
    // trong answerTypes của câu), giữ nguyên lựa chọn cũ nếu lần nộp này không gửi lại.
    if (q.answerTypes.length === 1) {
      obj.answeredAs = q.answerTypes[0];
    } else if (incoming && incoming.answeredAs && q.answerTypes.includes(incoming.answeredAs)) {
      obj.answeredAs = incoming.answeredAs;
    }
    if (obj.answeredAs === 'multiple_choice') {
      const selected = incoming ? (incoming.selectedIndices || []) : obj.selectedIndices;
      obj.selectedIndices = selected;
      const correct = [...q.answerIndices].sort().join(',') === [...selected].sort().join(',');
      obj.manualScore = correct ? obj.points : 0;
    } else if (obj.answeredAs) {
      if (incoming) {
        if (incoming.text !== undefined) obj.text = incoming.text;
        if (incoming.videoUrl !== undefined) obj.videoUrl = incoming.videoUrl;
        if (incoming.audioUrl !== undefined) obj.audioUrl = incoming.audioUrl;
        if (incoming.imageUrl !== undefined) obj.imageUrl = incoming.imageUrl;
      }
      // manualScore giữ null — chờ giảng viên chấm tay.
    }
    // obj.answeredAs vẫn null nghĩa là câu nhiều dạng nhưng học sinh chưa từng chọn
    // dạng nào để làm — coi như chưa trả lời, manualScore giữ null.
    return obj;
  });
  sub.score = sub.answers.reduce((s, a) => s + (typeof a.manualScore === 'number' ? a.manualScore : 0), 0);
  sub.pendingManualGrading = sub.answers.some(a => a.manualScore === null || a.manualScore === undefined);
  sub.submittedAt = new Date();
  sub.autoSubmitted = isLate ? true : !!autoSubmitted;
  await sub.save();
  success(res, { score: sub.score, totalPoints: sub.totalPoints }, 'Nộp bài thành công');
};

exports.reportTabSwitch = async (req, res, next) => {
  const sub = await HomeworkSubmission.findOne({ _id: req.params.id, studentId: req.studentAccount.studentId._id, submittedAt: null });
  if (!sub) return next(new AppError('Không tìm thấy bài làm', 404));
  await HomeworkSubmission.updateOne({ _id: sub._id }, { $inc: { tabSwitchCount: 1 } });
  success(res, null, 'Đã ghi nhận');
};

exports.sendDispute = async (req, res, next) => {
  const sub = await HomeworkSubmission.findOne({ _id: req.params.id, studentId: req.studentAccount.studentId._id });
  if (!sub) return next(new AppError('Không tìm thấy bài làm', 404));
  if (!sub.submittedAt) return next(new AppError('Bài chưa nộp, chưa thể thắc mắc', 400));
  const { text } = req.body;
  if (!text || !text.trim()) return next(new AppError('Vui lòng nhập nội dung thắc mắc', 400));
  sub.disputeMessages.push({ from: 'student', text: text.trim() });
  sub.disputeStatus = 'pending';
  await sub.save();
  success(res, sub, 'Đã gửi thắc mắc');
};

// Xem chi tiết bài nộp — tự đánh dấu đã xem điểm/phản hồi mới nhất.
// Khoá đáp án đúng trắc nghiệm nếu còn lượt làm lại + hạn chưa đóng (giống hệ Test —
// xem studentTestController.getAttemptReview).
exports.getSubmission = async (req, res, next) => {
  const sub = await HomeworkSubmission.findOne({ _id: req.params.id, studentId: req.studentAccount.studentId._id })
    .populate('answers.questionId');
  if (!sub) return next(new AppError('Không tìm thấy bài làm', 404));
  const assignment = await HomeworkAssignment.findById(sub.assignmentId);
  const now = Date.now();
  const usedCount = await HomeworkSubmission.countDocuments({ assignmentId: sub.assignmentId, studentId: sub.studentId, submittedAt: { $ne: null } });
  const stillHasAttempts = usedCount < assignment.maxAttempts;
  const notClosed = now <= new Date(assignment.endAt).getTime();
  const revealAnswers = !(assignment.maxAttempts > 1 && stillHasAttempts && notClosed);

  sub.studentSeenGradeAt = new Date();
  sub.studentSeenDisputeReplyAt = new Date();
  await sub.save();

  success(res, {
    _id: sub._id, score: sub.score, totalPoints: sub.totalPoints, submittedAt: sub.submittedAt,
    pendingManualGrading: sub.pendingManualGrading, disputeStatus: sub.disputeStatus, disputeMessages: sub.disputeMessages,
    answers: sub.answers.map(a => ({
      questionId: a.questionId._id, question: a.questionId.question, answerTypes: a.questionId.answerTypes,
      // Ảnh/audio/video của ĐỀ BÀI (không phải bài học sinh nộp) — để xem lại đủ
      // ngữ cảnh câu hỏi. answerVideoUrl/answerAudioUrl đặt tên khác audioUrl ở
      // trên để tránh nhầm với audio của đề bài (giống StartHomeworkResult).
      image: a.questionId.image, audioUrl: a.questionId.audioUrl, youtubeUrl: a.questionId.youtubeUrl,
      answeredAs: a.answeredAs,
      options: a.questionId.options,
      answerIndices: revealAnswers ? a.questionId.answerIndices : undefined,
      selectedIndices: a.selectedIndices, text: a.text, answerVideoUrl: a.videoUrl, answerAudioUrl: a.audioUrl, answerImageUrl: a.imageUrl,
      points: a.points, manualScore: a.manualScore, teacherNote: a.teacherNote,
    })),
  });
};

// Badge tổng hợp cho nav Student Portal.
exports.getHomeworkNotifications = async (req, res) => {
  const classId = await myClassId(req);
  const studentId = req.studentAccount.studentId._id;
  if (!classId) return success(res, { newAssignments: 0, newGrades: 0, newReplies: 0 });
  const now = new Date();
  const assignments = await HomeworkAssignment.find({ classId, openAt: { $lte: now }, endAt: { $gte: now } });
  const visible = assignments.filter(a => eligibleFor(a, studentId));
  const started = await HomeworkSubmission.find({ assignmentId: { $in: visible.map(a => a._id) }, studentId }).select('assignmentId');
  const startedSet = new Set(started.map(s => String(s.assignmentId)));
  const newAssignments = visible.filter(a => !startedSet.has(String(a._id))).length;

  const mySubs = await HomeworkSubmission.find({ studentId, submittedAt: { $ne: null } });
  const newGrades = mySubs.filter(s => !s.pendingManualGrading && (!s.studentSeenGradeAt || s.studentSeenGradeAt < s.updatedAt)).length;
  const newReplies = mySubs.filter(s => {
    const last = s.disputeMessages[s.disputeMessages.length - 1];
    return last && last.from === 'teacher' && (!s.studentSeenDisputeReplyAt || s.studentSeenDisputeReplyAt < last.createdAt);
  }).length;
  success(res, { newAssignments, newGrades, newReplies });
};
