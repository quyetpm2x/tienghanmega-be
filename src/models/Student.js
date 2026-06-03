const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className: String,
  level: String,
  startDate: String,
  status: { type: String, enum: ['active', 'completed', 'reserved', 'transferred', 'dropped'], default: 'active' },
  tuitionStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid' },
  amount:      { type: Number, default: 0 },   // tổng đã đóng
  coursePrice: { type: Number, default: 0 },   // học phí khoá học
  note:        { type: String, default: '' },   // ghi chú của admin
  transferHistory: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    level: String,
    transferredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
