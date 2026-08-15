const Class = require('../models/Class');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const MAX_HOMEPAGE_CLASSES = 5;

// Class.teacher is a plain name string picked from a dropdown in the admin
// form — resolve it to a Teacher._id so the teacher portal can scope queries
// by identity instead of by fragile name matching.
async function resolveTeacherId(teacherName) {
  if (!teacherName) return null;
  const teacher = await Teacher.findOne({ name: teacherName }).select('_id');
  return teacher ? teacher._id : null;
}

function todayDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Danh sách assignments hiện có, hoặc tự "vá" 1 đoạn ban đầu từ teacher/teacherId
// hiện tại cho lớp cũ chưa từng có teacherAssignments (tạo trước khi có tính năng này).
function currentAssignments(existingClass) {
  return existingClass.teacherAssignments && existingClass.teacherAssignments.length
    ? existingClass.teacherAssignments.map(a => (a.toObject ? a.toObject() : a))
    : (existingClass.teacher
        ? [{ teacherId: existingClass.teacherId, teacherName: existingClass.teacher, fromDate: existingClass.startDate || todayDateStr(), toDate: null }]
        : []);
}

// Class.enrolled is a stored field with no code path that keeps it in sync — attach
// the real Student count instead, so every consumer (admin list, edit form, public
// banner) sees the same accurate number.
async function withLiveEnrolled(classNames) {
  const counts = await Student.aggregate([
    { $match: { className: { $in: classNames } } },
    { $group: { _id: '$className', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(counts.map(c => [c._id, c.count]));
}

exports.getAll = async (req, res) => {
  const { status, showOnHomepage } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (showOnHomepage === 'true') filter.showOnHomepage = true;
  let query = Class.find(filter);
  query = showOnHomepage === 'true' ? query.sort({ homepageOrder: 1 }).limit(MAX_HOMEPAGE_CLASSES) : query.sort({ startDate: -1 });
  const classes = await query;

  // Classes pinned with an explicit adminOrder come first (ascending); everything
  // else keeps the default startDate-desc order — mirrors the schedule/banner ordering.
  if (showOnHomepage !== 'true') {
    classes.sort((a, b) => {
      const ao = a.adminOrder;
      const bo = b.adminOrder;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return 0;
    });
  }

  const enrolledMap = await withLiveEnrolled(classes.map(c => c.name));
  success(res, classes.map(c => ({ ...c.toObject(), enrolled: enrolledMap[c.name] || 0 })));
};

exports.getOne = async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const enrolledMap = await withLiveEnrolled([cls.name]);
  success(res, { ...cls.toObject(), enrolled: enrolledMap[cls.name] || 0 });
};

exports.create = async (req, res, next) => {
  if (req.body.showOnHomepage) {
    const count = await Class.countDocuments({ showOnHomepage: true });
    if (count >= MAX_HOMEPAGE_CLASSES) return next(new AppError('Đã đạt tối đa 5 lớp hiển thị banner homepage', 400));
  }
  const teacherId = await resolveTeacherId(req.body.teacher);
  const teacherAssignments = req.body.teacher
    ? [{ teacherId, teacherName: req.body.teacher, fromDate: req.body.startDate || todayDateStr(), toDate: null }]
    : [];
  const cls = await Class.create({ ...req.body, teacherId, teacherAssignments });
  success(res, cls, 'Tạo lớp học thành công', 201);
};

exports.update = async (req, res, next) => {
  if (req.body.showOnHomepage) {
    const existing = await Class.findById(req.params.id);
    if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));
    if (!existing.showOnHomepage) {
      const count = await Class.countDocuments({ showOnHomepage: true, _id: { $ne: req.params.id } });
      if (count >= MAX_HOMEPAGE_CLASSES) return next(new AppError('Đã đạt tối đa 5 lớp hiển thị banner homepage', 400));
    }
  }
  // Đổi giáo viên phụ trách KHÔNG đi qua đây nữa — phải qua transferTeacher (yêu cầu
  // chọn ngày hiệu lực rõ ràng), tránh 2 đường ghi teacherAssignments khác hành vi
  // nhau (route này trước đây luôn cắt mốc theo "hôm nay", dễ tính nhầm buổi đã dạy
  // trong ngày sang giáo viên mới). Bỏ hẳn field teacher/teacherId nếu lỡ gửi lên.
  const body = { ...req.body };
  delete body.teacher;
  delete body.teacherId;
  delete body.teacherAssignments;
  const cls = await Class.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  // Student.level là bản sao chụp course của lớp tại thời điểm thêm/chuyển lớp — nếu
  // admin đổi khoá học gắn với lớp sau đó, học sinh đang học lớp này sẽ bị lệch dữ liệu
  // (hiển thị sai, tra giá học phí sai...) nếu không đồng bộ lại ngay tại đây.
  if ('course' in body) {
    await Student.updateMany({ classId: cls._id }, { $set: { level: cls.course } });
  }
  success(res, cls, 'Cập nhật thành công');
};

// Đổi giáo viên phụ trách 1 lớp — bắt buộc chọn ngày hiệu lực (không mặc định
// "hôm nay" như cơ chế cũ), để admin tự quyết định buổi hôm nay tính cho ai nếu
// đổi giữa chừng buổi học. Đóng đoạn cũ đúng 1 ngày trước ngày hiệu lực, mở đoạn
// mới từ đúng ngày hiệu lực — giữ nguyên lịch sử để tính lương đúng từng giáo viên.
exports.transferTeacher = async (req, res, next) => {
  const { teacherName, effectiveDate } = req.body;
  if (!teacherName || !teacherName.trim()) return next(new AppError('Vui lòng chọn giáo viên', 400));
  if (!effectiveDate) return next(new AppError('Vui lòng chọn ngày hiệu lực', 400));

  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const newTeacherId = await resolveTeacherId(teacherName);
  const current = currentAssignments(existing);
  const open = current.find(a => !a.toDate);

  if (open) {
    if (effectiveDate <= open.fromDate) {
      return next(new AppError('Ngày hiệu lực phải sau ngày bắt đầu phụ trách của giáo viên hiện tại', 400));
    }
    if (String(open.teacherId) === String(newTeacherId)) {
      return next(new AppError('Giáo viên này đang phụ trách lớp rồi', 400));
    }
    open.toDate = addDaysStr(effectiveDate, -1);
  }
  current.push({ teacherId: newTeacherId, teacherName, fromDate: effectiveDate, toDate: null });

  existing.teacherAssignments = current;
  existing.teacher = teacherName;
  existing.teacherId = newTeacherId;
  await existing.save();
  success(res, existing, 'Đã cập nhật giáo viên phụ trách');
};

// Sửa lại ngày hiệu lực của 1 lần đổi giáo viên ĐÃ có trong lịch sử (VD admin chọn
// nhầm ngày lúc chuyển giao) — xác định đúng đoạn cần sửa bằng fromDate hiện tại của
// nó (không dùng index, tránh lệch nếu mảng bị sắp xếp khác đi ở đâu đó), rồi kéo
// theo cập nhật toDate của đoạn liền trước cho khớp — không đụng đoạn đầu tiên (đoạn
// đó là lúc lớp mới có giáo viên đầu tiên, không phải 1 lần "đổi").
exports.updateTeacherAssignmentDate = async (req, res, next) => {
  const { oldFromDate, newFromDate } = req.body;
  if (!oldFromDate || !newFromDate) return next(new AppError('Thiếu dữ liệu ngày', 400));

  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const current = currentAssignments(existing).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const idx = current.findIndex(a => a.fromDate === oldFromDate);
  if (idx === -1) return next(new AppError('Không tìm thấy giai đoạn phân công tương ứng', 404));
  if (idx === 0) return next(new AppError('Không thể sửa ngày của giáo viên đầu tiên (không phải 1 lần đổi giáo viên)', 400));

  const prev = current[idx - 1];
  const nextSeg = current[idx + 1];
  if (newFromDate <= prev.fromDate) return next(new AppError('Ngày mới phải sau ngày bắt đầu của giáo viên trước đó', 400));
  if (nextSeg && newFromDate >= nextSeg.fromDate) return next(new AppError('Ngày mới phải trước ngày bắt đầu của giáo viên kế tiếp', 400));

  current[idx].fromDate = newFromDate;
  prev.toDate = addDaysStr(newFromDate, -1);

  existing.teacherAssignments = current;
  await existing.save();
  success(res, existing, 'Đã cập nhật ngày đổi giáo viên');
};

// Huỷ lần đổi giáo viên GẦN NHẤT (VD admin bấm nhầm giáo viên) — xoá hẳn đoạn đang
// mở hiện tại khỏi lịch sử (không phải chỉ đóng nó lại), mở lại đoạn liền trước như
// trước khi có lần đổi đó. Chỉ áp dụng cho đoạn đang mở (mới nhất) — huỷ 1 lần đổi
// ở giữa lịch sử phức tạp hơn nhiều (phải nối lại 2 đoạn 2 bên) và không phải case
// thực tế cần tới (đổi nhầm luôn là vừa mới bấm xong).
exports.undoTeacherTransfer = async (req, res, next) => {
  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const current = currentAssignments(existing).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  if (current.length < 2) return next(new AppError('Không có lần đổi giáo viên nào để huỷ', 400));

  current.pop();
  const prev = current[current.length - 1];
  prev.toDate = null;

  existing.teacherAssignments = current;
  existing.teacher = prev.teacherName;
  existing.teacherId = prev.teacherId;
  await existing.save();
  success(res, existing, 'Đã huỷ lần đổi giáo viên gần nhất');
};

exports.remove = async (req, res, next) => {
  const cls = await Class.findByIdAndDelete(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, null, 'Xóa thành công');
};
