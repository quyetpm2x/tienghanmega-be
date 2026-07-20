const Test = require('../models/Test');
const TestSession = require('../models/TestSession');
const TestAttempt = require('../models/TestAttempt');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const tests = await Test.find().populate('assignedClassIds', 'name').sort({ createdAt: -1 });
  success(res, tests);
};

exports.getOne = async (req, res, next) => {
  const test = await Test.findById(req.params.id).populate('questions.questionId').populate('assignedClassIds', 'name');
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  success(res, test);
};

// Pool đề đang gán cho 1 lớp — dùng cho cả màn admin xem lại lẫn giáo viên mở phiên thi.
exports.getByClass = async (req, res) => {
  const tests = await Test.find({ assignedClassIds: req.params.classId }).select('title level duration questions');
  success(res, tests);
};

function validateBody(body, next) {
  const { title, level, duration, questions } = body;
  if (!title?.trim()) { next(new AppError('Vui lòng nhập tên đề', 400)); return false; }
  if (!level?.trim()) { next(new AppError('Vui lòng chọn cấp độ', 400)); return false; }
  if (!duration || duration <= 0) { next(new AppError('Thời lượng làm bài không hợp lệ', 400)); return false; }
  if (!Array.isArray(questions) || questions.length === 0) { next(new AppError('Đề cần ít nhất 1 câu hỏi', 400)); return false; }
  return true;
}

exports.create = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { title, level, duration, questions } = req.body;
  const test = await Test.create({ title: title.trim(), level: level.trim(), duration, questions });
  success(res, test, 'Tạo đề kiểm tra thành công', 201);
};

exports.update = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { title, level, duration, questions } = req.body;
  const test = await Test.findByIdAndUpdate(req.params.id, {
    title: title.trim(), level: level.trim(), duration, questions,
  }, { new: true, runValidators: true });
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  success(res, test, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const test = await Test.findById(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  if (test.assignedClassIds.length > 0) {
    return next(new AppError('Đề đang được gán cho ít nhất 1 lớp — bỏ gán hết trước khi xoá', 400));
  }
  // Chặn xoá nếu đề còn nằm trong bất kỳ phiên kiểm tra nào (kể cả đã đóng)
  // hoặc có bài làm nào của học sinh tham chiếu tới — nếu không, các trang xem
  // lại bài làm/bảng điểm sẽ bị lỗi do testId trỏ tới đề không còn tồn tại.
  const usedInSession = await TestSession.exists({ $or: [{ activeTestIds: test._id }, { poolTestIds: test._id }] });
  if (usedInSession) {
    return next(new AppError('Đề đang được dùng trong ít nhất 1 phiên kiểm tra (kể cả đã đóng), không thể xoá', 400));
  }
  const usedInAttempt = await TestAttempt.exists({ testId: test._id });
  if (usedInAttempt) {
    return next(new AppError('Đề đã có học sinh làm bài, không thể xoá', 400));
  }
  await test.deleteOne();
  success(res, null, 'Xoá thành công');
};

exports.assignClass = async (req, res, next) => {
  const { classId } = req.body;
  if (!classId) return next(new AppError('Thiếu classId', 400));
  const test = await Test.findById(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  if (test.assignedClassIds.some(id => String(id) === String(classId))) {
    return next(new AppError('Lớp này đã được gán đề', 400));
  }
  test.assignedClassIds.push(classId);
  await test.save();
  success(res, test, 'Gán lớp thành công');
};

exports.unassignClass = async (req, res, next) => {
  const { classId } = req.body;
  if (!classId) return next(new AppError('Thiếu classId', 400));
  const test = await Test.findById(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  test.assignedClassIds = test.assignedClassIds.filter(id => String(id) !== String(classId));
  await test.save();
  success(res, test, 'Bỏ gán lớp thành công');
};
