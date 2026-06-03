const mongoose = require('mongoose');

const visitorLogSchema = new mongoose.Schema({
  ip:          { type: String },
  country:     { type: String },
  countryCode: { type: String },
  city:        { type: String },
  isp:         { type: String },
  isVN:        { type: Boolean },
  isLocal:     { type: Boolean, default: false },
  page:        { type: String },
  referrer:    { type: String },
  userAgent:   { type: String },
}, { timestamps: true });

module.exports = mongoose.model('VisitorLog', visitorLogSchema);
