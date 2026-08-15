const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  // super_admin = toàn quyền tuyệt đối, KHÔNG bị giới hạn bởi `permissions` (tránh
  // trường hợp tự khoá hết quyền truy cập hệ thống). admin thường bị giới hạn theo
  // đúng danh sách `permissions` — key khớp với src/config/adminPermissions.js.
  role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

adminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

adminSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
