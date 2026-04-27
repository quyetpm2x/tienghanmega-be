const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  slug: { type: Number, required: true, unique: true }, // original id from frontend
  title: { type: String, required: true },
  desc: String,
  level: String,
  duration: String,
  students: { type: Number, default: 0 },
  rating: { type: Number, default: 5.0 },
  price: String,
  cat: { type: String, enum: ['beginner', 'topik', 'conversation', 'bundle'] },
  bg: String,
  char: String,
  instructor: String,
  accent: String,
  accentLight: String,
  schedule: {
    time: String,
    days: String,
  },
  content: [String],
  freeBonus: String,
  classInfo: {
    sessions: String,
    duration: String,
    size: String,
    teacher: String,
  },
  commitment: {
    target: String,
    result: String,
    refund: { type: Boolean, default: false },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
