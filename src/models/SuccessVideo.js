const mongoose = require('mongoose');

const successVideoSchema = new mongoose.Schema({
  youtubeUrl: { type: String, required: true, trim: true },
  videoId:    { type: String, required: true, trim: true },
  order:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SuccessVideo', successVideoSchema);
