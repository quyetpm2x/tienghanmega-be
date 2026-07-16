const mongoose = require('mongoose');

const courseCategorySchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  label: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
  bg:    { type: String, default: '#ede9fe' },
  order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CourseCategory', courseCategorySchema);
