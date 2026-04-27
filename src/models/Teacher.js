const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nat: { type: String, enum: ['vn', 'kr'], default: 'vn' },
  cert: String,
  credentials: [String],
  spec: String,
  color: String,
  src: String,
  isActive: { type: Boolean, default: true },
  // admin extended fields
  classes: [String],
  salary: Number,
  phone: String,
  rating: { type: Number, default: 5.0 },
  startDate: String,
  totalPaidSalary: { type: Number, default: 0 },
  totalSessions: { type: Number, default: 0 },
  monthSessions: { type: Number, default: 0 },
  adminNote: String,
}, { timestamps: true });

module.exports = mongoose.model('Teacher', teacherSchema);
