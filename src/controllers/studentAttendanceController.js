const StudentAttendance = require('../models/StudentAttendance');
const Student = require('../models/Student');
const { resolveClass, recordsOfClassesFilter } = require('../utils/classLink');
const { activeStudentIdsOfClass } = require('../utils/enrollment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Danh sách điểm danh mặc định = học sinh có ghi danh ĐANG HỌC ở lớp (một học sinh học
// nhiều lớp xuất hiện ở mọi lớp của mình).
async function rosterOf(classId) {
  const ids = await activeStudentIdsOfClass(classId);
  const students = await Student.find({ _id: { $in: ids } }).select('name').sort({ name: 1 }).lean();
  return students.map(s => ({ studentId: s._id, studentName: s.name, status: 'present', note: '' }));
}

// Chặn ghi điểm danh cho học sinh không liên quan tới lớp: chỉ nhận học sinh đang học
// lớp, hoặc đã có sẵn trong buổi này (sửa buổi cũ của học sinh nay đã nghỉ vẫn được).
async function assertRecordsBelong(classId, records, existingRecords = []) {
  if (!Array.isArray(records)) throw new AppError('Danh sách điểm danh không hợp lệ', 400);
  const allowed = new Set([
    ...(await activeStudentIdsOfClass(classId)).map(String),
    ...existingRecords.map(r => String(r.studentId)),
  ]);
  // Bản ghi cũ có thể thiếu studentId — chỉ chấp nhận khi đúng tên đã có sẵn trong buổi.
  const legacyNames = new Set(existingRecords.filter(r => !r.studentId).map(r => r.studentName));
  const stranger = records.find(r => (r.studentId
    ? !allowed.has(String(r.studentId))
    : !legacyNames.has(r.studentName)));
  if (stranger) throw new AppError(`Học sinh "${stranger.studentName || ''}" không thuộc lớp này`, 400);
}

// GET /admin/student-attendance?classId=… (hoặc ?className=… cho client cũ)
// Buổi điểm danh nối với lớp theo classId; bản ghi cũ chưa có classId thì theo tên.
exports.getAll = async (req, res) => {
  const { classId, className } = req.query;
  let filter = {};
  if (classId || className) {
    const cls = await resolveClass({ classId, className });
    if (cls) filter = recordsOfClassesFilter([cls]);
    else if (className) filter = { className }; // lớp không còn tồn tại
    else return success(res, []);
  }
  const sessions = await StudentAttendance.find(filter).sort({ date: -1 });
  success(res, sessions);
};

// Lớp gốc của một buổi điểm danh.
function classOfRecord(record) {
  return resolveClass({ classId: record.classId, className: record.classId ? undefined : record.className }, '_id name');
}

// POST — tạo buổi, không gửi records thì tự điền từ học sinh đang học lớp
exports.create = async (req, res, next) => {
  const { classId, className, date, sessionNum, note, records } = req.body;
  const cls = await resolveClass({ classId, className }, '_id name teacherId');
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  let finalRecords = records;
  if (!finalRecords || finalRecords.length === 0) finalRecords = await rosterOf(cls._id);
  else await assertRecordsBelong(cls._id, finalRecords);
  const session = await StudentAttendance.create({
    classId: cls._id, className: cls.name, teacherId: cls.teacherId || null, date,
    sessionNum: sessionNum || 1, note: note || '', records: finalRecords,
  });
  success(res, session, 'Tạo buổi điểm danh thành công', 201);
};

// PUT /:id — chỉ sửa nội dung buổi; lớp và giáo viên không đổi được qua đây (trước đây
// nhận nguyên req.body nên ghi đè được cả className/teacherId).
exports.update = async (req, res, next) => {
  const existing = await StudentAttendance.findById(req.params.id);
  if (!existing) return next(new AppError('Không tìm thấy buổi điểm danh', 404));
  const { date, sessionNum, note, records, replacesDate } = req.body;
  if (records !== undefined) {
    const cls = await classOfRecord(existing);
    if (cls) await assertRecordsBelong(cls._id, records, existing.records);
    existing.records = records;
  }
  if (date !== undefined) existing.date = date;
  if (sessionNum !== undefined) existing.sessionNum = sessionNum;
  if (note !== undefined) existing.note = note;
  // Liên kết buổi học bù với ngày lịch gốc (trang chi tiết lớp).
  if (replacesDate !== undefined) existing.replacesDate = replacesDate || null;
  await existing.save();
  success(res, existing, 'Cập nhật thành công');
};

// DELETE /:id
exports.remove = async (req, res, next) => {
  const session = await StudentAttendance.findByIdAndDelete(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy buổi điểm danh', 404));
  success(res, null, 'Đã xoá buổi điểm danh');
};

exports.assertRecordsBelong = assertRecordsBelong;
exports.classOfRecord = classOfRecord;
exports.rosterOf = rosterOf;
