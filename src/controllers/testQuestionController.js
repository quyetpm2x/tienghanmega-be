const TestQuestion = require('../models/TestQuestion');
const TestAttempt = require('../models/TestAttempt');
const { sameIndexSet } = require('../utils/testScoring');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin-only: quản lý ngân hàng câu hỏi cho tính năng Bài kiểm tra.

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.skill) filter.skill = req.query.skill;
  if (req.query.level) filter.level = req.query.level;
  const questions = await TestQuestion.find(filter).sort({ createdAt: -1 });
  success(res, questions);
};

// Tỷ lệ trả lời đúng của từng câu hỏi, tính trên toàn bộ bài làm đã nộp —
// đáp án đúng phải đối chiếu qua optionOrder vì đáp án được xáo trộn riêng
// theo từng lượt làm bài, không so trực tiếp answerIndices với selectedIndices.
exports.getStats = async (req, res) => {
  const questions = await TestQuestion.find().select('answerIndices');
  const answerIndicesMap = new Map(questions.map(q => [String(q._id), q.answerIndices]));

  const attempts = await TestAttempt.find({ submittedAt: { $ne: null } }).select('answers');
  const stats = new Map(); // questionId -> { attempts, correct }

  for (const attempt of attempts) {
    for (const ans of attempt.answers) {
      if (!ans.selectedIndices || ans.selectedIndices.length === 0) continue;
      const qid = String(ans.questionId);
      const answerIndices = answerIndicesMap.get(qid);
      if (answerIndices === undefined) continue; // câu hỏi đã bị xoá khỏi ngân hàng
      if (!stats.has(qid)) stats.set(qid, { attempts: 0, correct: 0 });
      const s = stats.get(qid);
      s.attempts += 1;
      const correctIndices = answerIndices.map(ai => ans.optionOrder.indexOf(ai));
      if (sameIndexSet(ans.selectedIndices, correctIndices)) s.correct += 1;
    }
  }

  const result = {};
  for (const [qid, s] of stats) {
    result[qid] = { attempts: s.attempts, correct: s.correct, correctRate: Math.round((s.correct / s.attempts) * 100) };
  }
  success(res, result);
};

function validateBody(body, next) {
  const { question, options, answerIndices, skill, level } = body;
  if (!question?.trim()) { next(new AppError('Vui lòng nhập nội dung câu hỏi', 400)); return false; }
  if (!Array.isArray(options) || options.length < 2 || options.some(o => !o?.trim())) {
    next(new AppError('Câu hỏi cần ít nhất 2 đáp án, không được để trống', 400)); return false;
  }
  if (!Array.isArray(answerIndices) || answerIndices.length === 0 || answerIndices.some(i => i < 0 || i >= options.length)) {
    next(new AppError('Vui lòng chọn ít nhất 1 đáp án đúng hợp lệ', 400)); return false;
  }
  if (new Set(answerIndices).size !== answerIndices.length) { next(new AppError('Đáp án đúng bị trùng lặp', 400)); return false; }
  if (!['listening', 'reading', 'grammar', 'vocab'].includes(skill)) { next(new AppError('Kỹ năng không hợp lệ', 400)); return false; }
  if (!level?.trim()) { next(new AppError('Vui lòng nhập cấp độ', 400)); return false; }
  return true;
}

exports.create = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { question, image, audioUrl, options, answerIndices, explanation, skill, level, points } = req.body;
  const doc = await TestQuestion.create({
    question: question.trim(), image: image || '', audioUrl: audioUrl || '',
    options, answerIndices, explanation: explanation || '', skill, level: level.trim(),
    points: points || 1,
  });
  success(res, doc, 'Thêm câu hỏi thành công', 201);
};

exports.update = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { question, image, audioUrl, options, answerIndices, explanation, skill, level, points } = req.body;
  const doc = await TestQuestion.findByIdAndUpdate(req.params.id, {
    question: question.trim(), image: image || '', audioUrl: audioUrl || '',
    options, answerIndices, explanation: explanation || '', skill, level: level.trim(),
    points: points || 1,
  }, { new: true, runValidators: true });
  if (!doc) return next(new AppError('Không tìm thấy câu hỏi', 404));
  success(res, doc, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const Test = require('../models/Test');
  const inUse = await Test.exists({ 'questions.questionId': req.params.id });
  if (inUse) return next(new AppError('Câu hỏi đang được dùng trong ít nhất 1 đề kiểm tra, không thể xoá', 400));
  const doc = await TestQuestion.findByIdAndDelete(req.params.id);
  if (!doc) return next(new AppError('Không tìm thấy câu hỏi', 404));
  success(res, null, 'Xoá thành công');
};
