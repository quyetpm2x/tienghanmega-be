const mongoose = require('mongoose');

const scheduleItemSchema = new mongoose.Schema({
  name: String,
  date: String,
  days: String,
  time: String,
  slots: { type: Number, default: 0 },
});

const scheduleSchema = new mongoose.Schema({
  month: { type: String, required: true },
  courses: [scheduleItemSchema],
}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
