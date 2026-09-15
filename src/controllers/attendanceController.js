const TeacherSession = require('../models/TeacherSession');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { resolveClass, recordsOfClassesFilter } = require('../utils/classLink');

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

exports.create = async (req, res) => {
  const body = await withClassRef(req.body, { required: true });
  const session = await TeacherSession.create(body);
  success(res, session, 'Ghi nhận buổi dạy thành công', 201);
};

exports.update = async (req, res, next) => {
  const { rescheduledDate, rescheduledTime, ...rest } = req.body;
  const update = await withClassRef({ ...rest }, { required: false });

  if (rescheduledDate !== undefined) {
    update.rescheduledDate = rescheduledDate;
    update.rescheduledTime = rescheduledTime || '';
    update.$push = { rescheduleHistory: { date: rescheduledDate, time: rescheduledTime || '', savedAt: new Date() } };
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
