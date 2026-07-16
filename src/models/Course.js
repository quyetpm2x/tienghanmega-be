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
  // Khớp với CourseCategory.key — không dùng enum cứng để admin thêm/xoá danh mục
  // qua /admin/courses (tab Danh mục) mà không cần deploy lại code.
  cat: { type: String },
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
  image: String,
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
