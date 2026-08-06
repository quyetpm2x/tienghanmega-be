const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const faqSchema = new mongoose.Schema({
  question: i18nField({ required: true }),
  answer:   i18nField({ required: true }),
  order:    { type: Number, default: 0 },
  active:   { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('FAQ', faqSchema);
