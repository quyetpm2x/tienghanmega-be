const Enrollment = require('../models/Enrollment');
const Student = require('../models/Student');
const StudentAttendance = require('../models/StudentAttendance');
const TeacherSession = require('../models/TeacherSession');
const TeacherBonus = require('../models/TeacherBonus');
const AppError = require('../utils/AppError');

// Lớp ở trang Lớp học là GỐC: đổi tên lớp thì mọi dữ liệu còn nối với lớp bằng TÊN phải đổi
// theo trong cùng transaction — nếu không, điểm danh cũ "biến mất" khỏi lớp và buổi dạy
// không tra được đơn giá lương (teacherLedger tra lớp theo tên).
async function renameClassEverywhere({ classId, oldName, newName, session }) {
  if (!oldName || oldName === newName) return null;

  // Điểm danh duy nhất theo (tên lớp, ngày): nếu tên mới đã có buổi trùng ngày (dữ liệu của
  // một lớp cùng tên đã xoá) thì dừng, không gộp đè im lặng.
  // Bản ghi của lớp: theo classId; bản ghi cũ chưa có classId thì theo tên cũ.
  const ofClass = { $or: [{ classId }, { classId: null, className: oldName }] };
  const oldDates = await StudentAttendance.distinct('date', ofClass).session(session);
  if (oldDates.length) {
    const clash = await StudentAttendance.find({ className: newName, date: { $in: oldDates }, classId: { $ne: classId } })
      .select('date').session(session).lean();
    if (clash.length) {
      throw new AppError(`Không đổi được tên: đã có buổi điểm danh mang tên "${newName}" trùng ngày ${clash.map(c => c.date).join(', ')}`, 400);
    }
  }

  const [enrollments, attendances, sessions, bonuses, students] = [
    await Enrollment.updateMany({ classId }, { $set: { className: newName } }).session(session),
    // Gắn luôn classId cho bản ghi cũ để từ nay nối theo lớp gốc.
    await StudentAttendance.updateMany(ofClass, { $set: { className: newName, classId } }).session(session),
    await TeacherSession.updateMany(ofClass, { $set: { className: newName, classId } }).session(session),
    await TeacherBonus.updateMany(
      { $or: [{ classId }, { classId: null, className: oldName }] },
      { $set: { className: newName } },
    ).session(session),
    // Trường cũ trên học sinh: giữ khớp để nếu phải quay lui code cũ thì dữ liệu vẫn đúng.
    await Student.updateMany(
      { $or: [{ classId }, { classId: null, className: oldName }] },
      { $set: { className: newName } },
    ).session(session),
  ];
  return {
    enrollments: enrollments.modifiedCount,
    attendances: attendances.modifiedCount,
    teacherSessions: sessions.modifiedCount,
    teacherBonuses: bonuses.modifiedCount,
    students: students.modifiedCount,
  };
}

module.exports = { renameClassEverywhere };
