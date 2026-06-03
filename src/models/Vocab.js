const mongoose = require('mongoose');
const vocabSchema = new mongoose.Schema({
  kr:    { type: String, required: true },
  vn:    { type: String, required: true },
  rom:   { type: String, required: true },
  level: { type: String, default: 'basic' },
  order: { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model('Vocab', vocabSchema);
