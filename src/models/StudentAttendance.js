const mongoose = require('mongoose');

// One document = one session (date) for a class
// records[] = each student's attendance for that session
const studentAttendanceSchema = new mongoose.Schema({
  className:  { type: String, required: true },
  date:       { type: String, required: true },   // "2026-05-20"
  sessionNum: { type: Number, default: 1 },        // buổi số mấy
  note:         { type: String, default: '' },        // ghi chú buổi học
  replacesDate: { type: String, default: null },       // ngày lịch gốc mà buổi chuyển này thay thế
  records: [{
    studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    studentName: { type: String, required: true },
    status:      { type: String, enum: ['present','absent','late','excused'], default: 'present' },
    note:        { type: String, default: '' },
  }],
}, { timestamps: true });

studentAttendanceSchema.index({ className: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('StudentAttendance', studentAttendanceSchema);
