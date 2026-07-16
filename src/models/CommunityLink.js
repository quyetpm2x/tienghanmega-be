const mongoose = require('mongoose');

const communityLinkSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true, trim: true },
  linkUrl:  { type: String, required: true, trim: true },
  order:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CommunityLink', communityLinkSchema);
