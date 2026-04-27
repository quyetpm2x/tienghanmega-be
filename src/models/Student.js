const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className: String,
  level: String,
  startDate: String,
  tuitionStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid' },
  amount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
