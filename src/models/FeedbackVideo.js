const mongoose = require('mongoose');

const feedbackVideoSchema = new mongoose.Schema({
  youtubeUrl: { type: String, required: true, trim: true },
  videoId:    { type: String, required: true, trim: true },
  name:       { type: String, required: true, trim: true },
  course:     { type: String, required: true, trim: true },
  order:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('FeedbackVideo', feedbackVideoSchema);
