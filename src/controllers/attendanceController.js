const TeacherSession = require('../models/TeacherSession');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { resolveClass, recordsOfClassesFilter } = require('../utils/classLink');
const Class = require('../models/Class');
const { isValidClassDate } = require('../utils/classDate');

// Buổi dạy của giảng viên nối với lớp theo classId (lớp ở trang Lớp học là gốc); className
// chỉ là bản sao để hiển thị, luôn lấy từ lớp gốc, không tin client.

// GET /admin/attendance?teacherName=&classId=|className=&month=YYYY-MM&date=YYYY-MM-DD
exports.getAll = async (req, res) => {
  const { teacherName, month, date, classId, className } = req.query;
  const filter = {};
  if (teacherName) filter.teacherName = teacherName;
  // Trước đây bỏ qua `date` → trang điểm danh lấy nhầm buổi mới nhất của lớp để chấm công.
  if (date) filter.date = date;
  else if (month) filter.date = { $regex: `^${month}` };
  if (classId || className) {
    const cls = await resolveClass({ classId, className });
    if (cls) Object.assign(filter, recordsOfClassesFilter([cls]));
    else if (className) filter.className = className; // bản ghi của lớp không còn tồn tại
    else return success(res, []);
  }
  const sessions = await TeacherSession.find(filter).sort({ date: -1 });
  success(res, sessions);
};

// Gắn classId + tên lớp hiện tại từ lớp gốc vào body tạo/sửa.
async function withClassRef(body, { required }) {
  const hasRef = body.classId !== undefined || body.className !== undefined;
  if (!hasRef) {
    if (required) throw new AppError('Thiếu lớp học của buổi dạy', 400);
    return body;
  }
  const cls = await resolveClass({ classId: body.classId, className: body.className });
  if (!cls) throw new AppError('Không tìm thấy lớp học', 400);
  return { ...body, classId: cls._id, className: cls.name };
}

// Mỗi lớp mỗi ngày chỉ MỘT bản ghi buổi dạy: đã có thì cập nhật bản đó (bản sửa gần nhất)
// thay vì tạo thêm — bản trùng làm lương admin và lương giảng viên tự xem lệch nhau.
exports.create = async (req, res, next) => {
  const body = await withClassRef(req.body, { required: true });
  // Bất biến: không tạo được buổi dạy nằm ngoài lịch của lớp (xem utils/classDate.js).
  const cls = await Class.findById(body.classId).lean();
  if (!isValidClassDate(cls, body, 'session')) {
    return next(new AppError(`Ngày ${body.date} không nằm trong lịch học của lớp — kiểm tra lại khoá học của lớp hoặc chọn ngày khác`, 400));
  }
  // Hoà updatedAt thì _id lớn hơn thắng, khớp với bản mà sổ lương coi là có hiệu lực
  // (utils/teacherLedger.js#beats) — không thì admin có thể đang sửa bản ghi không hiệu lực.
  const existing = await TeacherSession.findOne({ classId: body.classId, date: body.date }).sort({ updatedAt: -1, _id: -1 });
  if (existing) {
    const { rescheduleHistory, ...rest } = body;
    Object.assign(existing, rest);
    if (Array.isArray(rescheduleHistory) && rescheduleHistory.length) existing.rescheduleHistory.push(...rescheduleHistory);
    await existing.save();
    return success(res, existing, 'Cập nhật buổi dạy thành công');
  }
  const session = await TeacherSession.create(body);
  success(res, session, 'Ghi nhận buổi dạy thành công', 201);
};

exports.update = async (req, res, next) => {
  const { rescheduledDate, rescheduledTime, paidTeacherId, paidTeacherName, paidRate, ...rest } = req.body;
  const update = await withClassRef({ ...rest }, { required: false });

  if (rescheduledDate !== undefined) {
    update.rescheduledDate = rescheduledDate;
    update.rescheduledTime = rescheduledTime || '';
    update.$push = { rescheduleHistory: { date: rescheduledDate, time: rescheduledTime || '', savedAt: new Date() } };
    // Đổi ngày bù = buổi này tính sang KỲ LƯƠNG của ngày mới. Chỉ ghi payDate khi admin
    // THỰC SỰ đổi ngày bù — xem hay sửa ghi chú thì không đụng, để bản ghi cũ (chưa có
    // payDate) giữ nguyên kỳ lương lịch sử. Xem utils/sessionPay.js.
    update.payDate = rescheduledDate || null;
  }

  // Chốt đích danh ai dạy buổi này và bao nhiêu tiền. Không gửi lên = giữ nguyên, tức là
  // vẫn kế thừa giảng viên và đơn giá của buổi gốc.
  if (paidTeacherId !== undefined) {
    update.paidTeacherId = paidTeacherId || null;
    update.paidTeacherName = paidTeacherName || '';
  }
  if (paidRate !== undefined) update.paidRate = paidRate === '' || paidRate == null ? null : Number(paidRate);

  // Bản ghi ĐANG mồ côi thì vẫn cho sửa — nếu chặn luôn sẽ không dọn được dữ liệu cũ.
  // Chỉ chặn khi thao tác làm một bản ghi đang hợp lệ trở thành mồ côi.
  const before = await TeacherSession.findById(req.params.id).lean();
  if (!before) return next(new AppError('Không tìm thấy buổi dạy', 404));

  // 'substituted' mà không chỉ ra ai dạy thay thì buổi đó không thuộc về ai — giảng viên
  // gốc bị trừ, không ai được cộng lại, tiền biến mất không dấu vết. Xét trạng thái SAU
  // khi trộn: client gửi mỗi {status} cho bản ghi vốn đã có người dạy thay là hợp lệ.
  const merged = { ...before, ...update };
  if (merged.status === 'substituted' && !merged.substituteTeacherId && !merged.paidTeacherId) {
    return next(new AppError('Chọn giáo viên dạy thay — nếu không, buổi này sẽ không được tính cho ai', 400));
  }
  // Đổi trạng thái khỏi 'substituted' mà còn sót substituteRate thì mức lương dạy thay sẽ
  // bị trả cho giảng viên GỐC (xem utils/sessionPay.js, chuỗi fallback đơn giá).
  if (before.status === 'substituted' && merged.status !== 'substituted'
      && update.substituteRate === undefined && before.substituteRate != null) {
    update.substituteRate = null;
    update.substituteTeacherId = null;
    update.substituteTeacherName = '';
  }
  const cls = await Class.findById(update.classId || before.classId).lean();
  const wasValid = isValidClassDate(cls, before, 'session');
  const willBeValid = isValidClassDate(cls, { ...before, ...update }, 'session');
  if (wasValid && !willBeValid) {
    return next(new AppError(`Ngày ${update.date || before.date} không nằm trong lịch học của lớp`, 400));
  }

  const session = await TeacherSession.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!session) return next(new AppError('Không tìm thấy buổi dạy', 404));
  success(res, session, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const session = await TeacherSession.findByIdAndDelete(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy buổi dạy', 404));
  success(res, null, 'Xóa thành công');
};
