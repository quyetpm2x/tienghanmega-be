const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const feedbackImageSchema = new mongoose.Schema({
  image:  i18nField({ required: true }),
  name:   { type: String, required: true, trim: true },
  course: { type: String, required: true, trim: true },
  order:  { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('FeedbackImage', feedbackImageSchema);
