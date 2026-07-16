const mongoose = require('mongoose');

const feedbackImageSchema = new mongoose.Schema({
  image:  { type: String, required: true, trim: true },
  name:   { type: String, required: true, trim: true },
  course: { type: String, required: true, trim: true },
  order:  { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('FeedbackImage', feedbackImageSchema);
