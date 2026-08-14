const HomeworkAssignment = require('../models/HomeworkAssignment');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin CHỈ XEM tổng hợp BTVN toàn hệ thống — không có create/update/delete/grade
// ở đây (giảng viên toàn quyền quản lý BTVN của lớp mình, xem teacherHomeworkController).
exports.getAssignments = async (req, res) => {
  const assignments = await HomeworkAssignment.find()
    .populate('teacherId', 'name').populate('classId', 'name').sort({ createdAt: -1 });
  const counts = await HomeworkSubmission.aggregate([
    { $group: { _id: '$assignmentId', submitted: { $sum: { $cond: [{ $ne: ['$submittedAt', null] }, 1, 0] } }, avgScore: { $avg: '$score' } } },
  ]);
  const countMap = new Map(counts.map(c => [String(c._id), c]));
  success(res, assignments.map(a => ({
    ...a.toObject(),
    submittedCount: countMap.get(String(a._id))?.submitted || 0,
    avgScore: countMap.get(String(a._id))?.avgScore ?? null,
  })));
};

// Chi tiết 1 bài giao (kèm câu hỏi đầy đủ) — dùng cho modal "Xem chi tiết" ở admin,
// tách riêng khỏi getAssignments (list) để không phải populate câu hỏi cho MỌI bài
// giao mỗi lần tải trang, chỉ populate khi admin thật sự mở xem 1 bài cụ thể.
exports.getAssignment = async (req, res, next) => {
  const a = await HomeworkAssignment.findById(req.params.id)
    .populate('teacherId', 'name').populate('classId', 'name').populate('questions.questionId');
  if (!a) return next(new AppError('Không tìm thấy bài giao', 404));
  success(res, a);
};

exports.getAssignmentSubmissions = async (req, res, next) => {
  const assignment = await HomeworkAssignment.findById(req.params.id);
  if (!assignment) return next(new AppError('Không tìm thấy bài giao', 404));
  const subs = await HomeworkSubmission.find({ assignmentId: assignment._id })
    .populate('studentId', 'name').sort({ createdAt: -1 });
  success(res, subs);
};
