const mongoose = require('mongoose');

const teacherSessionSchema = new mongoose.Schema({
  teacherName: { type: String, required: true },
  date: { type: String, required: true },
  className: { type: String, required: true },
  status: { type: String, enum: ['taught', 'not-taught', 'rescheduled', 'absent'], default: 'not-taught' },
  note: { type: String, default: '' },
  rescheduledDate: { type: String, default: '' },
  rescheduledTime: { type: String, default: '' },
  rescheduleHistory: [{
    date: String,
    time: String,
    savedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('TeacherSession', teacherSessionSchema);
