const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const communityLinkSchema = new mongoose.Schema({
  imageUrl: i18nField({ required: true }),
  linkUrl:  { type: String, required: true, trim: true },
  order:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CommunityLink', communityLinkSchema);
