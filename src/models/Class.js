const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  course: { type: String, required: true },
  teacher: String,
  days: String,
  time: String,
  capacity: { type: Number, default: 10 },
  enrolled: { type: Number, default: 0 },
  startDate: String,
  endDate: String,
  status: { type: String, enum: ['active', 'upcoming', 'closed'], default: 'upcoming' },
  color: String,
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);
