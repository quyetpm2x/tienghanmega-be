const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const accountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['teacher'], default: 'teacher' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  mustChangePassword: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

accountSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

accountSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Account', accountSchema);
