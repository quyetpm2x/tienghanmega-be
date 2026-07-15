const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  course: { type: String, required: true },
  teacher: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  days: String,
  time: String,
  capacity: { type: Number, default: 10 },
  enrolled: { type: Number, default: 0 },
  startDate: String,
  endDate: String,
  status: { type: String, enum: ['active', 'upcoming', 'closed'], default: 'upcoming' },
  color: String,
  note: { type: String, default: '' },
  promo: { type: String, default: '' },
  showOnHomepage: { type: Boolean, default: false },
  homepageOrder: { type: Number, default: null },
  showOnSchedule: { type: Boolean, default: false },
  scheduleOrder: { type: Number, default: null },
  adminOrder: { type: Number, default: null },
  ratePerSession: { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);
