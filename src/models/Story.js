const mongoose = require('mongoose');
const storySchema = new mongoose.Schema({
  name:   { type: String, required: true },
  result: { type: String, required: true },
  text:   { type: String, required: true },
  avatar: { type: String, default: '' },
  color:  { type: String, default: '#1E3A5F' },
  order:  { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model('Story', storySchema);
