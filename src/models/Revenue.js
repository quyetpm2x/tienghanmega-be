const mongoose = require('mongoose');

const revenueSchema = new mongoose.Schema({
  month: { type: String, required: true },
  shortMonth: String,
  revenue: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  collected: { type: Number, default: 0 },
  breakdown: {
    beginner: { type: Number, default: 0 },
    intermediate: { type: Number, default: 0 },
    topik: { type: Number, default: 0 },
    conversation: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model('Revenue', revenueSchema);
