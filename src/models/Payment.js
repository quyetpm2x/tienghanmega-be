const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  studentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName:    String,
  classId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className:      String,
  courseCategory: { type: String, enum: ['beginner', 'intermediate', 'topik', 'conversation'], default: 'conversation' },
  amount:         { type: Number, required: true, min: 1 },
  paidAt:         { type: Date, default: Date.now },
  note:           { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
