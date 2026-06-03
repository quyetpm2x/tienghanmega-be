const StudentAttendance = require('../models/StudentAttendance');
const Student = require('../models/Student');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// GET /admin/student-attendance?className=SC1-A
exports.getAll = async (req, res) => {
  const { className } = req.query;
  const filter = {};
  if (className) filter.className = className;
  const sessions = await StudentAttendance.find(filter).sort({ date: -1 });
  success(res, sessions);
};

// POST — create a new session with records auto-populated from class students
exports.create = async (req, res) => {
  const { className, date, sessionNum, note, records } = req.body;

  // If no records provided, auto-populate from current students in this class
  let finalRecords = records;
  if (!finalRecords || finalRecords.length === 0) {
    const students = await Student.find({ className, status: 'active' });
    finalRecords = students.map(s => ({
      studentId: s._id,
      studentName: s.name,
      status: 'present',
      note: '',
    }));
  }

  const session = await StudentAttendance.create({ className, date, sessionNum: sessionNum || 1, note: note || '', records: finalRecords });
  success(res, session, 'Tạo buổi điểm danh thành công', 201);
};

// PUT /:id — update a session (records, note)
exports.update = async (req, res, next) => {
  const session = await StudentAttendance.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!session) return next(new AppError('Không tìm thấy buổi điểm danh', 404));
  success(res, session, 'Cập nhật thành công');
};

// DELETE /:id
exports.remove = async (req, res, next) => {
  const session = await StudentAttendance.findByIdAndDelete(req.params.id);
  if (!session) return next(new AppError('Không tìm thấy buổi điểm danh', 404));
  success(res, null, 'Đã xoá buổi điểm danh');
};
