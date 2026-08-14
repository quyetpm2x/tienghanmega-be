const Class = require('../models/Class');
const HomeworkQuestion = require('../models/HomeworkQuestion');
const HomeworkPaper = require('../models/HomeworkPaper');
const HomeworkAssignment = require('../models/HomeworkAssignment');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const myTeacherId = (req) => req.teacherAccount.teacherId._id;

// Giáo viên chỉ được thao tác trên các lớp mình dạy (giống teacherTestController).
async function assertOwnClass(teacherId, classId) {
  const cls = await Class.findOne({ _id: classId, teacherId });
  return cls || null;
}

// ─── Ngân hàng câu hỏi (riêng từng giảng viên) ──────────────────────────────

exports.getQuestions = async (req, res) => {
  const questions = await HomeworkQuestion.find({ teacherId: myTeacherId(req) }).sort({ createdAt: -1 });
  success(res, questions);
};

const VALID_ANSWER_TYPES = ['text', 'multiple_choice', 'video', 'audio'];

exports.createQuestion = async (req, res, next) => {
  const { question, youtubeUrl, image, audioUrl, answerTypes, options, answerIndices, points } = req.body;
  if (!question || !question.trim()) return next(new AppError('Vui lòng nhập đề bài', 400));
  if (!Array.isArray(answerTypes) || answerTypes.length === 0 || !answerTypes.every(a => VALID_ANSWER_TYPES.includes(a))) {
    return next(new AppError('Vui lòng chọn ít nhất 1 dạng bài học sinh phải nộp', 400));
  }
  if (answerTypes.includes('multiple_choice')) {
    if (!Array.isArray(options) || options.length < 2) return next(new AppError('Trắc nghiệm cần ít nhất 2 đáp án', 400));
    if (!Array.isArray(answerIndices) || answerIndices.length < 1) return next(new AppError('Vui lòng chọn ít nhất 1 đáp án đúng', 400));
  }
  const q = await HomeworkQuestion.create({
    teacherId: myTeacherId(req), question: question.trim(),
    youtubeUrl: youtubeUrl || '', image: image || '', audioUrl: audioUrl || '',
    answerTypes, options: answerTypes.includes('multiple_choice') ? options : [],
    answerIndices: answerTypes.includes('multiple_choice') ? answerIndices : [],
    points: points || 1,
  });
  success(res, q, 'Tạo câu hỏi thành công', 201);
};

exports.updateQuestion = async (req, res, next) => {
  const q = await HomeworkQuestion.findOne({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!q) return next(new AppError('Không tìm thấy câu hỏi', 404));
  const { question, youtubeUrl, image, audioUrl, answerTypes, options, answerIndices, points } = req.body;
  if (answerTypes !== undefined && (!Array.isArray(answerTypes) || answerTypes.length === 0 || !answerTypes.every(a => VALID_ANSWER_TYPES.includes(a)))) {
    return next(new AppError('Vui lòng chọn ít nhất 1 dạng bài học sinh phải nộp', 400));
  }
  if (question !== undefined) q.question = question.trim();
  if (youtubeUrl !== undefined) q.youtubeUrl = youtubeUrl;
  if (image !== undefined) q.image = image;
  if (audioUrl !== undefined) q.audioUrl = audioUrl;
  if (answerTypes !== undefined) q.answerTypes = answerTypes;
  if (options !== undefined) q.options = options;
  if (answerIndices !== undefined) q.answerIndices = answerIndices;
  if (points !== undefined) q.points = points;
  await q.save();
  success(res, q, 'Cập nhật thành công');
};

exports.deleteQuestion = async (req, res, next) => {
  const q = await HomeworkQuestion.findOneAndDelete({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!q) return next(new AppError('Không tìm thấy câu hỏi', 404));
  success(res, null, 'Xoá thành công');
};

// ─── Đề BTVN (tuỳ chọn — gom câu hỏi để tái sử dụng) ────────────────────────

exports.getPapers = async (req, res) => {
  const papers = await HomeworkPaper.find({ teacherId: myTeacherId(req) })
    .populate('questions.questionId').sort({ createdAt: -1 });
  success(res, papers);
};

exports.createPaper = async (req, res, next) => {
  const { title, questions } = req.body;
  if (!title || !title.trim()) return next(new AppError('Vui lòng nhập tên đề', 400));
  if (!Array.isArray(questions) || questions.length === 0) return next(new AppError('Vui lòng chọn ít nhất 1 câu hỏi', 400));
  const paper = await HomeworkPaper.create({ teacherId: myTeacherId(req), title: title.trim(), questions });
  success(res, paper, 'Tạo đề thành công', 201);
};

exports.updatePaper = async (req, res, next) => {
  const paper = await HomeworkPaper.findOne({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!paper) return next(new AppError('Không tìm thấy đề', 404));
  const { title, questions } = req.body;
  if (title !== undefined) paper.title = title.trim();
  if (questions !== undefined) paper.questions = questions;
  await paper.save();
  success(res, paper, 'Cập nhật thành công');
};

exports.deletePaper = async (req, res, next) => {
  const paper = await HomeworkPaper.findOneAndDelete({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!paper) return next(new AppError('Không tìm thấy đề', 404));
  success(res, null, 'Xoá thành công');
};

// ─── Giao bài ────────────────────────────────────────────────────────────

// hasSubmissions = đã có học sinh bắt đầu làm (kể cả chưa nộp) — dùng ở FE để
// khoá sửa lớp/buổi học/nguồn câu hỏi một khi đã có người động vào bài giao.
// submittedCount/pendingGradingCount = dùng cho bảng ở tab "Chấm bài" — biết
// ngay bài nào cần chấm mà không phải bấm vào từng bài để xem.
exports.getAssignments = async (req, res) => {
  const assignments = await HomeworkAssignment.find({ teacherId: myTeacherId(req) })
    .populate('classId', 'name').sort({ lessonDate: -1, createdAt: -1 });
  const counts = await HomeworkSubmission.aggregate([
    { $match: { assignmentId: { $in: assignments.map(a => a._id) } } },
    { $group: {
      _id: '$assignmentId',
      total: { $sum: 1 },
      submitted: { $sum: { $cond: [{ $ne: ['$submittedAt', null] }, 1, 0] } },
      pendingGrading: { $sum: { $cond: ['$pendingManualGrading', 1, 0] } },
    } },
  ]);
  const countMap = new Map(counts.map(c => [String(c._id), c]));
  success(res, assignments.map(a => {
    const c = countMap.get(String(a._id));
    return {
      ...a.toObject(),
      hasSubmissions: !!c && c.total > 0,
      submittedCount: c?.submitted || 0,
      pendingGradingCount: c?.pendingGrading || 0,
    };
  }));
};

exports.getAssignment = async (req, res, next) => {
  const a = await HomeworkAssignment.findOne({ _id: req.params.id, teacherId: myTeacherId(req) })
    .populate('classId', 'name').populate('questions.questionId').populate('studentIds', 'name');
  if (!a) return next(new AppError('Không tìm thấy bài giao', 404));
  success(res, a);
};

exports.createAssignment = async (req, res, next) => {
  const teacherId = myTeacherId(req);
  const { classId, lessonDate, paperId, questions, studentIds, openAt, endAt, timerMinutes, maxAttempts } = req.body;
  const owns = await assertOwnClass(teacherId, classId);
  if (!owns) return next(new AppError('Không tìm thấy lớp', 404));
  if (!lessonDate) return next(new AppError('Vui lòng chọn buổi học', 400));
  if (!Array.isArray(questions) || questions.length === 0) return next(new AppError('Vui lòng chọn ít nhất 1 câu hỏi', 400));
  if (!openAt || !endAt) return next(new AppError('Vui lòng đặt giờ mở/đóng', 400));
  if (new Date(endAt) <= new Date(openAt)) return next(new AppError('Giờ đóng phải sau giờ mở', 400));
  const a = await HomeworkAssignment.create({
    teacherId, classId, lessonDate, paperId: paperId || null, questions,
    studentIds: Array.isArray(studentIds) ? studentIds : [],
    openAt, endAt, timerMinutes: timerMinutes || null, maxAttempts: maxAttempts || 1,
  });
  success(res, a, 'Giao bài thành công', 201);
};

exports.updateAssignment = async (req, res, next) => {
  const teacherId = myTeacherId(req);
  const a = await HomeworkAssignment.findOne({ _id: req.params.id, teacherId });
  if (!a) return next(new AppError('Không tìm thấy bài giao', 404));
  const { classId, lessonDate, paperId, questions, openAt, endAt, timerMinutes, maxAttempts, studentIds } = req.body;

  // Lớp/buổi học CHỈ được sửa khi CHƯA có học sinh nào bắt đầu làm — đổi lớp sau
  // khi có người đã start sẽ khiến bài đang làm dở của họ lạc khỏi assignment.
  const touchesLockedFields = classId !== undefined || lessonDate !== undefined || paperId !== undefined;
  const hasSubmissions = await HomeworkSubmission.exists({ assignmentId: a._id });
  if (touchesLockedFields && hasSubmissions) {
    return next(new AppError('Không thể sửa lớp/buổi học vì đã có học sinh làm bài — hãy xoá bài giao này và tạo bài mới nếu cần đổi', 400));
  }

  if (classId !== undefined) {
    const owns = await assertOwnClass(teacherId, classId);
    if (!owns) return next(new AppError('Không tìm thấy lớp', 404));
    a.classId = classId;
  }
  if (lessonDate !== undefined) {
    if (!lessonDate) return next(new AppError('Vui lòng chọn buổi học', 400));
    a.lessonDate = lessonDate;
  }
  if (questions !== undefined) {
    if (!Array.isArray(questions) || questions.length === 0) return next(new AppError('Vui lòng chọn ít nhất 1 câu hỏi', 400));
    // Đã có học sinh làm bài thì chỉ được THÊM câu hỏi mới — không được sửa/xoá
    // câu đã giao, vì bài đang làm dở của học sinh tham chiếu đúng những câu đó,
    // xoá đi sẽ lỗi lúc họ nộp bài (báo lỗi ở submitAssignment: "q is undefined").
    if (hasSubmissions) {
      const existingIds = a.questions.map(q => String(q.questionId));
      const newIds = new Set(questions.map(q => String(q.questionId)));
      const removedAny = existingIds.some(id => !newIds.has(id));
      if (removedAny) return next(new AppError('Đã có học sinh làm bài — chỉ có thể thêm câu hỏi mới, không thể sửa/xoá câu đã giao', 400));
    }
    a.questions = questions;
  }
  if (paperId !== undefined) a.paperId = paperId || null;
  if (openAt !== undefined) a.openAt = openAt;
  if (endAt !== undefined) a.endAt = endAt;
  if (timerMinutes !== undefined) a.timerMinutes = timerMinutes;
  if (maxAttempts !== undefined) a.maxAttempts = maxAttempts;
  if (studentIds !== undefined) a.studentIds = studentIds;
  if (new Date(a.endAt) <= new Date(a.openAt)) return next(new AppError('Giờ đóng phải sau giờ mở', 400));
  await a.save();
  success(res, a, 'Cập nhật thành công');
};

exports.deleteAssignment = async (req, res, next) => {
  const a = await HomeworkAssignment.findOneAndDelete({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!a) return next(new AppError('Không tìm thấy bài giao', 404));
  await HomeworkSubmission.deleteMany({ assignmentId: a._id });
  success(res, null, 'Xoá thành công');
};

// Danh sách bài nộp của 1 assignment — dùng cho tab "Chấm bài".
exports.getAssignmentSubmissions = async (req, res, next) => {
  const a = await HomeworkAssignment.findOne({ _id: req.params.id, teacherId: myTeacherId(req) });
  if (!a) return next(new AppError('Không tìm thấy bài giao', 404));
  const subs = await HomeworkSubmission.find({ assignmentId: a._id })
    .populate('studentId', 'name').populate('answers.questionId').sort({ createdAt: -1 });
  success(res, subs);
};

// Badge tổng hợp toàn bộ lớp mình dạy — "cần chấm" + "có phản hồi học sinh".
exports.getHomeworkNotifications = async (req, res) => {
  const teacherId = myTeacherId(req);
  const assignmentIds = (await HomeworkAssignment.find({ teacherId }).select('_id')).map(a => a._id);
  const pendingGrading = await HomeworkSubmission.countDocuments({ assignmentId: { $in: assignmentIds }, pendingManualGrading: true });
  const pendingDispute = await HomeworkSubmission.countDocuments({ assignmentId: { $in: assignmentIds }, disputeStatus: 'pending' });
  success(res, { pendingGrading, pendingDispute });
};

// ─── Chấm bài + thắc mắc ───────────────────────────────────────────────────

// manualScore là điểm THỰC NHẬN cuối cùng của câu đó (không phải "điểm chấm tay" theo
// nghĩa hẹp) — với trắc nghiệm được set tự động ngay lúc nộp bài (0 hoặc điểm tối đa),
// với text/video/audio giữ null cho tới khi giảng viên chấm ở đây. pendingManualGrading
// = còn ÍT NHẤT 1 câu manualScore null.
exports.gradeSubmission = async (req, res, next) => {
  const sub = await HomeworkSubmission.findById(req.params.id).populate('assignmentId');
  if (!sub || String(sub.assignmentId.teacherId) !== String(myTeacherId(req))) {
    return next(new AppError('Không tìm thấy bài nộp', 404));
  }
  const { grades } = req.body; // [{ questionId, score, note }]
  if (!Array.isArray(grades) || !grades.length) return next(new AppError('Thiếu dữ liệu chấm điểm', 400));
  const gradeMap = new Map(grades.map(g => [String(g.questionId), g]));
  sub.answers = sub.answers.map(a => {
    const obj = a.toObject();
    const g = gradeMap.get(String(a.questionId));
    if (g) {
      obj.manualScore = g.score;
      if (g.note !== undefined) obj.teacherNote = g.note;
    }
    return obj;
  });
  sub.score = sub.answers.reduce((s, a) => s + (typeof a.manualScore === 'number' ? a.manualScore : 0), 0);
  sub.pendingManualGrading = sub.answers.some(a => a.manualScore === null || a.manualScore === undefined);
  if (sub.disputeStatus === 'pending' || sub.disputeStatus === 'responded') sub.disputeStatus = 'regraded';
  await sub.save();
  success(res, sub, 'Chấm điểm thành công');
};

exports.replyDispute = async (req, res, next) => {
  const sub = await HomeworkSubmission.findById(req.params.id).populate('assignmentId');
  if (!sub || String(sub.assignmentId.teacherId) !== String(myTeacherId(req))) {
    return next(new AppError('Không tìm thấy bài nộp', 404));
  }
  const { text } = req.body;
  if (!text || !text.trim()) return next(new AppError('Vui lòng nhập nội dung phản hồi', 400));
  sub.disputeMessages.push({ from: 'teacher', text: text.trim() });
  if (sub.disputeStatus !== 'regraded') sub.disputeStatus = 'responded';
  await sub.save();
  success(res, sub, 'Đã gửi phản hồi');
};
