const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const materialSchema = new mongoose.Schema({
  order:     { type: Number, default: 0 },
  src:       { type: String, default: '' },      // image URL / path
  title:     i18nField({ required: true }),
  cat:       i18nField(),                         // Sơ cấp, Trung cấp, TOPIK …
  desc:      i18nField(),
  tag:       { type: String, default: '' },       // SC1, SC2, TC3 …
  color:     { type: String, default: '#1E3A5F' },
  driveLink: { type: String, default: '' },       // Google Drive download link
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Material', materialSchema);
