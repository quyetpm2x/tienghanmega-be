const Class = require('../models/Class');
const Student = require('../models/Student');
const StudentAttendance = require('../models/StudentAttendance');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Everything in this controller derives its scope from req.teacherAccount
// (set by protectTeacher) — never from client-supplied filters. A teacher can
// only ever see/write rows tied to their own teacherId.

// Whitelist — never leak price/promo/homepage-display config to a teacher.
const CLASS_FIELDS = 'name course days time capacity startDate endDate status color';

// "Hôm nay" theo giờ Việt Nam (UTC+7, không có DST) — không dùng
// new Date().toISOString() vì đó là giờ UTC và phụ thuộc timezone của server,
// gây lệch 1 ngày vào khoảng 00:00–06:59 giờ VN.
function todayVN() {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
}

exports.getMyClasses = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const classes = await Class.find({ teacherId }).select(CLASS_FIELDS).sort({ startDate: -1 });
  success(res, classes);
};

exports.getMyClass = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const cls = await Class.findOne({ _id: req.params.id, teacherId }).select(CLASS_FIELDS);
  // 404, not 403 — don't confirm the class exists if it isn't theirs.
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, cls);
};

// Roster for taking attendance — name only, never the admin-facing fields
// (phone/tuition/note/amount) which a teacher has no need to see.
exports.getClassStudents = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const cls = await Class.findOne({ _id: req.params.id, teacherId }).select('name');
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const students = await Student.find({ className: cls.name, status: 'active' }).select('name').sort({ name: 1 });
  success(res, students);
};

exports.getMyAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const filter = { teacherId };
  if (req.query.classId) {
    const cls = await Class.findOne({ _id: req.query.classId, teacherId }).select('name');
    if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
    filter.className = cls.name;
  }
  const sessions = await StudentAttendance.find(filter).sort({ date: -1 });
  success(res, sessions);
};

exports.createAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { className, date, sessionNum, note, records } = req.body;

  const cls = await Class.findOne({ name: className, teacherId });
  if (!cls) return next(new AppError('Lớp học không thuộc quyền quản lý của bạn', 403));

  let finalRecords = records;
  if (!finalRecords || finalRecords.length === 0) {
    const students = await Student.find({ className, status: 'active' });
    finalRecords = students.map(s => ({ studentId: s._id, studentName: s.name, status: 'present', note: '' }));
  } else if (date < todayVN()) {
    // Buổi đã qua ngày — giáo viên không được set trạng thái điểm danh (chỉ admin
    // mới sửa được, tránh chỉnh sửa hồi tố ảnh hưởng tới lương tính theo buổi dạy).
    // Ghi chú (note) vẫn được giữ nguyên từ client.
    finalRecords = finalRecords.map(r => ({ ...r, status: 'present' }));
  }

  const session = await StudentAttendance.create({ className, teacherId, date, sessionNum: sessionNum || 1, note: note || '', records: finalRecords });
  success(res, session, 'Tạo buổi điểm danh thành công', 201);
};

exports.updateAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const existing = await StudentAttendance.findOne({ _id: req.params.id, teacherId });
  if (!existing) return next(new AppError('Không tìm thấy buổi điểm danh', 404));

  // className/teacherId are never editable from this endpoint — only session content.
  const { date, sessionNum, note, records } = req.body;
  const body = {};
  if (date !== undefined) body.date = date;
  if (sessionNum !== undefined) body.sessionNum = sessionNum;
  if (note !== undefined) body.note = note;
  if (records !== undefined) {
    const isPast = existing.date < todayVN();
    // Buổi đã qua ngày — chỉ cho cập nhật ghi chú, giữ nguyên trạng thái điểm danh cũ.
    body.records = isPast
      ? records.map(r => {
          const orig = existing.records.find(o => String(o.studentId) === String(r.studentId));
          return { ...r, status: orig ? orig.status : r.status };
        })
      : records;
  }

  const session = await StudentAttendance.findByIdAndUpdate(req.params.id, body, { new: true });
  success(res, session, 'Cập nhật thành công');
};
