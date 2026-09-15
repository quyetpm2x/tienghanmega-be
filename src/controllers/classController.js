const mongoose = require('mongoose');
const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const Teacher = require('../models/Teacher');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { activeStudentCountsByClass } = require('../utils/enrollment');
const { categoryOf } = require('../utils/courseCategory');
const { renameClassEverywhere } = require('../services/classRenameService');

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

// Gộp các đoạn LIỀN NHAU (đứng cạnh nhau sau khi sort theo fromDate) mà cùng 1 giáo
// viên thành 1 đoạn duy nhất — xảy ra khi sửa tên giáo viên của 1 đoạn trùng với
// giáo viên ngay trước/sau nó, hoặc khi chèn thêm 1 lần đổi trùng tên. Nhận mảng ĐÃ
// sort tăng dần theo fromDate, trả về mảng mới đã gộp (vẫn tăng dần).
function mergeAdjacentAssignments(sortedAsc) {
  const merged = [];
  for (const seg of sortedAsc) {
    const last = merged[merged.length - 1];
    const sameTeacher = last && String(last.teacherId || '') === String(seg.teacherId || '') && last.teacherName === seg.teacherName;
    if (sameTeacher) {
      last.toDate = seg.toDate;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// Class.enrolled là trường lưu tay không ai cập nhật — trả sĩ số THẬT: số học sinh có
// ghi danh đang học ở lớp (đếm người, bỏ học sinh đã nghỉ; trước đây đếm cả người nghỉ
// và join bằng tên lớp).
async function withLiveEnrolled(classes) {
  return activeStudentCountsByClass(classes.map(c => c._id));
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

  const enrolledMap = await withLiveEnrolled(classes);
  success(res, classes.map(c => ({ ...c.toObject(), enrolled: enrolledMap[String(c._id)] || 0 })));
};

exports.getOne = async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const enrolledMap = await withLiveEnrolled([cls]);
  success(res, { ...cls.toObject(), enrolled: enrolledMap[String(cls._id)] || 0 });
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
  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));
  if (req.body.showOnHomepage && !existing.showOnHomepage) {
    const count = await Class.countDocuments({ showOnHomepage: true, _id: { $ne: req.params.id } });
    if (count >= MAX_HOMEPAGE_CLASSES) return next(new AppError('Đã đạt tối đa 5 lớp hiển thị banner homepage', 400));
  }
  // Đổi giáo viên phụ trách KHÔNG đi qua đây nữa — phải qua transferTeacher (yêu cầu
  // chọn ngày hiệu lực rõ ràng), tránh 2 đường ghi teacherAssignments khác hành vi
  // nhau (route này trước đây luôn cắt mốc theo "hôm nay", dễ tính nhầm buổi đã dạy
  // trong ngày sang giáo viên mới). Bỏ hẳn field teacher/teacherId nếu lỡ gửi lên.
  const body = { ...req.body };
  delete body.teacher;
  delete body.teacherId;
  delete body.teacherAssignments;

  const oldName = existing.name;
  if ('name' in body) {
    body.name = String(body.name || '').trim();
    if (!body.name) return next(new AppError('Vui lòng nhập tên lớp', 400));
  }
  const renamed = 'name' in body && body.name !== oldName;
  if (renamed && await Class.exists({ name: body.name, _id: { $ne: existing._id } })) {
    return next(new AppError(`Đã có lớp tên "${body.name}"`, 400));
  }

  // Lớp là GỐC: cập nhật lớp và mọi nơi nối theo tên lớp / khoá học trong MỘT transaction.
  const { cls, renameSync } = await mongoose.connection.transaction(async session => {
    const updated = await Class.findByIdAndUpdate(existing._id, body, { new: true, runValidators: true, session });
    const sync = renamed
      ? await renameClassEverywhere({ classId: updated._id, oldName, newName: updated.name, session })
      : null;
    // Khoá học của lớp đổi → ghi danh đổi theo (giá ghi danh KHÔNG đổi).
    if ('course' in body) {
      await Enrollment.updateMany(
        { classId: updated._id },
        { $set: { courseTitle: updated.course || '', courseCategory: categoryOf(updated.course) } },
      ).session(session);
    }
    return { cls: updated, renameSync: sync };
  });

  const message = renameSync
    ? `Đã đổi tên lớp và cập nhật theo: ${renameSync.enrollments} ghi danh, ${renameSync.attendances} buổi điểm danh, ${renameSync.teacherSessions} buổi dạy, ${renameSync.teacherBonuses} thưởng/phạt`
    : 'Cập nhật thành công';
  success(res, { ...cls.toObject(), renameSync }, message);
};

// Đổi/chèn giáo viên phụ trách 1 lớp tại 1 ngày hiệu lực bất kỳ — không bắt buộc phải
// sau đoạn đang mở như trước, có thể chèn vào ĐẦU (trước đoạn sớm nhất), GIỮA (cắt đôi
// 1 đoạn đã đóng) hay CUỐI (sau đoạn đang mở, hành vi cũ) lịch sử. Cách làm: thêm đoạn
// mới vào mảng rồi sort lại theo fromDate, sau đó tính lại toDate của TỪNG đoạn dựa
// theo đúng thứ tự mới (đoạn nào cũng kết thúc đúng 1 ngày trước khi đoạn kế tiếp bắt
// đầu, đoạn cuối cùng luôn để ngỏ) — tự động xử lý đúng cả 3 trường hợp trên bằng 1
// đường logic duy nhất. Gộp lại nếu vô tình tạo ra 2 đoạn liền nhau cùng giáo viên.
exports.transferTeacher = async (req, res, next) => {
  const { teacherName, effectiveDate } = req.body;
  if (!teacherName || !teacherName.trim()) return next(new AppError('Vui lòng chọn giáo viên', 400));
  if (!effectiveDate) return next(new AppError('Vui lòng chọn ngày hiệu lực', 400));

  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const newTeacherId = await resolveTeacherId(teacherName);
  const current = currentAssignments(existing).sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  if (current.some(a => a.fromDate === effectiveDate)) {
    return next(new AppError('Đã có 1 lần đổi giáo viên bắt đầu đúng ngày này rồi — dùng "Sửa lại tên giáo viên" nếu muốn đổi tên cho đúng ngày đó.', 400));
  }

  current.push({ teacherId: newTeacherId, teacherName, fromDate: effectiveDate, toDate: null });
  current.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  for (let i = 0; i < current.length; i++) {
    current[i].toDate = i === current.length - 1 ? null : addDaysStr(current[i + 1].fromDate, -1);
  }

  const merged = mergeAdjacentAssignments(current);
  const last = merged[merged.length - 1];
  existing.teacherAssignments = merged;
  existing.teacher = last.teacherName;
  existing.teacherId = last.teacherId;
  await existing.save();
  success(res, existing, 'Đã cập nhật giáo viên phụ trách');
};

// Sửa lại "từ ngày ... đến ngày ..." của 1 đoạn ĐÃ có trong lịch sử — xác định đúng
// đoạn cần sửa bằng fromDate hiện tại của nó (không dùng index, tránh lệch nếu mảng
// bị sắp xếp khác đi ở đâu đó). Admin tự chọn cả 2 đầu, KHÔNG còn tự động kéo theo
// đóng/mở đoạn liền kề như trước — cho phép chủ động để lại KHOẢNG TRỐNG (lớp tạm
// thời không ai phụ trách 1 vài ngày, VD giữa 2 giáo viên có khoảng nghỉ) miễn không
// CHỒNG LẤN với đoạn liền kề (chồng lấn = 2 giáo viên cùng được ghi nhận 1 ngày,
// không rõ ai mới thật sự dạy — luôn chặn). Cảnh báo khoảng trống (nếu có) tính ở FE
// bằng cách so đoạn mới với 2 đoạn liền kề, không cần BE trả riêng.
exports.updateTeacherAssignmentDate = async (req, res, next) => {
  const { oldFromDate, newFromDate, newToDate } = req.body;
  if (!oldFromDate || !newFromDate) return next(new AppError('Thiếu dữ liệu ngày', 400));
  if (newToDate && newToDate < newFromDate) return next(new AppError('Ngày kết thúc phải sau ngày bắt đầu', 400));

  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const current = currentAssignments(existing).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const idx = current.findIndex(a => a.fromDate === oldFromDate);
  if (idx === -1) return next(new AppError('Không tìm thấy giai đoạn phân công tương ứng', 404));

  const isLast = idx === current.length - 1;
  if (!isLast && !newToDate) return next(new AppError('Đoạn này không phải đoạn gần nhất — phải chọn ngày kết thúc', 400));

  if (idx > 0) {
    const prev = current[idx - 1];
    if (newFromDate <= prev.toDate) return next(new AppError('Ngày bắt đầu chồng lấn với đoạn trước đó', 400));
  }
  if (!isLast) {
    const nextSeg = current[idx + 1];
    if (newToDate >= nextSeg.fromDate) return next(new AppError('Ngày kết thúc chồng lấn với đoạn kế tiếp', 400));
  }

  current[idx].fromDate = newFromDate;
  current[idx].toDate = newToDate || null;

  const merged = mergeAdjacentAssignments(current);
  existing.teacherAssignments = merged;
  // Đoạn đang mở (nếu còn) mới là giáo viên "hiện tại" — nếu admin vừa đóng hẳn đoạn
  // cuối cùng (chọn ngày kết thúc cho đoạn gần nhất) thì lớp tạm thời không có giáo
  // viên phụ trách, phải phản ánh đúng ở teacher/teacherId top-level.
  const openSeg = merged.find(a => !a.toDate);
  existing.teacher = openSeg ? openSeg.teacherName : '';
  existing.teacherId = openSeg ? openSeg.teacherId : null;
  await existing.save();
  success(res, existing, 'Đã cập nhật ngày');
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

  const merged = mergeAdjacentAssignments(current);
  const last = merged[merged.length - 1];
  existing.teacherAssignments = merged;
  existing.teacher = last.teacherName;
  existing.teacherId = last.teacherId;
  await existing.save();
  success(res, existing, 'Đã huỷ lần đổi giáo viên gần nhất');
};

// Sửa lại TÊN giáo viên của 1 đoạn BẤT KỲ trong lịch sử (xác định bằng fromDate,
// giống cách updateTeacherAssignmentDate xác định đoạn cần sửa) — dùng khi admin ghi
// nhầm giáo viên, dù là đoạn đầu tiên, đoạn giữa hay đoạn đang mở. Khác với
// transferTeacher: KHÔNG đổi fromDate/toDate, không tạo đoạn mới, chỉ sửa lại đúng
// người cho đoạn đã có sẵn — tránh mọi lần sửa nhầm đều phải tồn tại vĩnh viễn trong
// lịch sử. Nếu đoạn được sửa là đoạn đang mở thì đồng bộ luôn teacher/teacherId ở
// top-level cho khớp.
exports.correctAssignmentTeacher = async (req, res, next) => {
  const { fromDate, teacherName } = req.body;
  if (!fromDate) return next(new AppError('Thiếu dữ liệu ngày', 400));
  if (!teacherName || !teacherName.trim()) return next(new AppError('Vui lòng chọn giáo viên', 400));

  const existing = await Class.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));

  const current = currentAssignments(existing).sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  const seg = current.find(a => a.fromDate === fromDate);
  if (!seg) return next(new AppError('Không tìm thấy giai đoạn phân công tương ứng', 404));

  const newTeacherId = await resolveTeacherId(teacherName);
  seg.teacherName = teacherName;
  seg.teacherId = newTeacherId;

  const merged = mergeAdjacentAssignments(current);
  const last = merged[merged.length - 1];
  existing.teacherAssignments = merged;
  if (!last.toDate) {
    existing.teacher = last.teacherName;
    existing.teacherId = last.teacherId;
  }
  await existing.save();
  success(res, existing, 'Đã sửa lại giáo viên');
};

exports.remove = async (req, res, next) => {
  // Xoá lớp còn học sinh đang học sẽ để lại ghi danh trỏ vào lớp không tồn tại.
  const hasActive = await Enrollment.exists({ classId: req.params.id, status: 'active' });
  if (hasActive) return next(new AppError('Lớp còn học sinh đang học — hãy chuyển lớp hoặc cho nghỉ trước khi xoá', 400));
  const cls = await Class.findByIdAndDelete(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, null, 'Xóa thành công');
};
