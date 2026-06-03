const mongoose = require('mongoose');
const topikQuestionSchema = new mongoose.Schema({
  q:     { type: String, required: true },
  opts:  [{ type: String }],
  ans:   { type: Number, required: true },
  exp:   { type: String, default: '' },
  level: { type: String, default: 'beginner' },
  order: { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model('TopikQuestion', topikQuestionSchema);
