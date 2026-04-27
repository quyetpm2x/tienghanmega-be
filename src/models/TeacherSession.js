const mongoose = require('mongoose');

const teacherSessionSchema = new mongoose.Schema({
  teacherName: { type: String, required: true },
  date: { type: String, required: true },
  className: { type: String, required: true },
  status: { type: String, enum: ['taught', 'absent'], default: 'taught' },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('TeacherSession', teacherSessionSchema);
