const Test = require('../models/Test');
const TestQuestion = require('../models/TestQuestion');
const TestSession = require('../models/TestSession');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  const tests = await Test.find({ assignedClassIds: req.params.classId }).select('title level proficiency duration questions');
  success(res, tests);
};

function validateBody(body, next) {
  const { title, level, proficiency, duration, questions } = body;
  if (!title?.trim()) { next(new AppError('Vui lòng nhập tên đề', 400)); return false; }
  if (!level?.trim()) { next(new AppError('Vui lòng chọn độ khó', 400)); return false; }
  if (!proficiency?.trim()) { next(new AppError('Vui lòng chọn trình độ', 400)); return false; }
  if (!duration || duration <= 0) { next(new AppError('Thời lượng làm bài không hợp lệ', 400)); return false; }
  if (!Array.isArray(questions) || questions.length === 0) { next(new AppError('Đề cần ít nhất 1 câu hỏi', 400)); return false; }
  return true;
}

exports.create = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { title, level, proficiency, duration, questions } = req.body;
  const test = await Test.create({ title: title.trim(), level: level.trim(), proficiency: proficiency.trim(), duration, questions });
  success(res, test, 'Tạo đề kiểm tra thành công', 201);
};

// Mô tả 1 tiêu chí lọc (skill/level/proficiency, bỏ trống = không lọc theo tiêu đó)
// dùng trong thông báo lỗi để admin biết chính xác tiêu chí nào thiếu câu.
function describeRule(r) {
  const parts = [];
  parts.push(`kỹ năng: ${r.skill || 'tất cả'}`);
  parts.push(`độ khó: ${r.level || 'tất cả'}`);
  parts.push(`trình độ: ${r.proficiency || 'tất cả'}`);
  return parts.join(', ');
}

// Tạo nhanh nhiều đề cùng lúc — mỗi đề gồm nhiều "tiêu chí" (rules), mỗi tiêu
// chí rút ngẫu nhiên 1 số câu riêng theo skill/level/proficiency riêng (skill/
// level/proficiency bỏ trống trong 1 tiêu chí = không lọc theo tiêu đó), rồi
// gộp tất cả câu của các tiêu chí lại thành 1 đề. VD: 10 đề, mỗi đề = 4 câu
// Đọc-Dễ-Sơ cấp 1 + 3 câu Nghe-Trung bình-Sơ cấp 2. Các đề khác nhau có thể
// trùng câu hỏi với nhau (không tiêu hao ngân hàng). level/proficiency truyền
// riêng ở top-level là nhãn độ khó/trình độ chung cho CẢ đề (hiển thị ở danh
// sách đề), độc lập với level/proficiency lọc trong từng tiêu chí.
exports.quickGenerate = async (req, res, next) => {
  const { titlePrefix, count, level, proficiency, duration, rules } = req.body;
  if (!titlePrefix?.trim()) return next(new AppError('Vui lòng nhập tên đề', 400));
  if (!level?.trim()) return next(new AppError('Vui lòng chọn độ khó', 400));
  if (!proficiency?.trim()) return next(new AppError('Vui lòng chọn trình độ', 400));
  if (!duration || duration <= 0) return next(new AppError('Thời lượng làm bài không hợp lệ', 400));

  const numCount = Number(count);
  if (!Number.isInteger(numCount) || numCount < 1 || numCount > 50) {
    return next(new AppError('Số lượng đề phải là số nguyên từ 1 đến 50', 400));
  }
  if (!Array.isArray(rules) || rules.length === 0) {
    return next(new AppError('Vui lòng thêm ít nhất 1 tiêu chí câu hỏi', 400));
  }

  // Chuẩn bị pool cho từng tiêu chí trước, kiểm tra đủ câu ngay từ đầu — tránh
  // tạo dở dang rồi mới phát hiện thiếu câu ở 1 tiêu chí nào đó.
  const preparedRules = [];
  for (const r of rules) {
    const ruleCount = Number(r?.count);
    if (!Number.isInteger(ruleCount) || ruleCount < 1) {
      return next(new AppError('Số câu trong mỗi tiêu chí phải là số nguyên lớn hơn 0', 400));
    }
    const filter = {};
    if (r.skill) filter.skill = r.skill;
    if (r.level) filter.level = r.level;
    if (r.proficiency) filter.proficiency = r.proficiency;
    const pool = await TestQuestion.find(filter).select('_id points');
    if (pool.length < ruleCount) {
      return next(new AppError(`Tiêu chí (${describeRule(r)}) chỉ có ${pool.length} câu, không đủ ${ruleCount} câu yêu cầu`, 400));
    }
    preparedRules.push({ pool, count: ruleCount });
  }

  const tests = [];
  for (let i = 0; i < numCount; i++) {
    // Map để tự loại trùng nếu 2 tiêu chí khác nhau vô tình chọn phải cùng 1 câu.
    const pickedMap = new Map();
    for (const rule of preparedRules) {
      const picked = shuffle(rule.pool).slice(0, rule.count);
      for (const q of picked) pickedMap.set(String(q._id), q.points);
    }
    tests.push({
      title: numCount > 1 ? `${titlePrefix.trim()} ${i + 1}` : titlePrefix.trim(),
      level: level.trim(), proficiency: proficiency.trim(), duration,
      questions: Array.from(pickedMap.entries()).map(([questionId, points]) => ({ questionId, points })),
    });
  }
  const created = await Test.insertMany(tests);
  success(res, created, `Đã tạo ${created.length} đề kiểm tra`, 201);
};

exports.update = async (req, res, next) => {
  if (!validateBody(req.body, next)) return;
  const { title, level, proficiency, duration, questions } = req.body;
  const test = await Test.findByIdAndUpdate(req.params.id, {
    title: title.trim(), level: level.trim(), proficiency: proficiency.trim(), duration, questions,
  }, { new: true, runValidators: true });
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  success(res, test, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const test = await Test.findById(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề kiểm tra', 404));
  // Admin đã xác nhận xoá (gõ YES ở FE) — cho xoá luôn kể cả khi đề đang gán
  // cho lớp, đang nằm trong phiên kiểm tra, hoặc đã có học sinh làm bài.
  // assignedClassIds chỉ lưu 1 chiều trên Test nên xoá cả document là tự dọn
  // sạch, không cần update riêng.
  //
  // Cơ chế liên kết xoá đề ↔ phiên kiểm tra: xoá đề CHỈ xoá đề khỏi ngân hàng
  // — KHÔNG đụng tới TestAttempt (giữ nguyên kết quả/bài làm học sinh đã có).
  // Với mọi phiên đang tham chiếu đề này: gỡ testId khỏi activeTestIds/
  // poolTestIds, ghi removedTestNotices để admin thấy cảnh báo ngay trên item
  // phiên, và ĐÓNG LUÔN phiên đó (status: 'closed') — đề đã mất thì phiên
  // không thể mở cho học sinh làm tiếp được nữa, nhưng phiên + kết quả cũ vẫn
  // giữ nguyên để xem lại.
  await TestSession.updateMany(
    { $or: [{ activeTestIds: test._id }, { poolTestIds: test._id }] },
    {
      $pull: { activeTestIds: test._id, poolTestIds: test._id },
      $push: { removedTestNotices: { title: test.title } },
      $set: { status: 'closed', closedAt: new Date().toISOString() },
    }
  );
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
