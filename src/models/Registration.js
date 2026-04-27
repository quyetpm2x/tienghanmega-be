const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  level: { type: String, required: true },
  course: String,
  note: String,
  // lead tracking
  time: String,
  source: { type: String, default: 'Website' },
  status: { type: String, enum: ['new', 'contacted', 'enrolled', 'cancelled'], default: 'new' },
}, { timestamps: true });

module.exports = mongoose.model('Registration', registrationSchema);
