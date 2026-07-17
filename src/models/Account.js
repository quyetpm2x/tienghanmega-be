const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Mã hoá 2 chiều (AES-256-GCM) cho mật khẩu giáo viên/học sinh — CHỈ dùng để
// admin/giáo viên xem lại mật khẩu hiện tại trong UI quản lý tài khoản, KHÔNG
// bao giờ dùng để đăng nhập (đăng nhập luôn xác thực qua bcrypt `password`).
// Đánh đổi bảo mật đã được xác nhận: nếu DB + ENC_KEY cùng bị lộ thì mật khẩu
// hiện tại của giáo viên/học sinh có thể bị đọc được — tài khoản Admin (model
// riêng, không đi qua Account) không lưu bản mã hoá 2 chiều này.
const ENC_ALGO = 'aes-256-gcm';
function getEncKey() {
  const raw = process.env.ACCOUNT_PASSWORD_ENC_KEY;
  if (!raw) throw new Error('Thiếu ACCOUNT_PASSWORD_ENC_KEY trong .env (chuỗi bất kỳ, sẽ tự chuẩn hoá về 32 byte cho AES-256)');
  return crypto.createHash('sha256').update(raw).digest();
}
function encryptPassword(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, getEncKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decryptPassword(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ENC_ALGO, getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const accountSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  // select:false — chỉ trả về khi query chủ động .select({ passwordPlainEnc: 1 }),
  // tránh lộ ra ở các API không cần xem mật khẩu.
  passwordPlainEnc: { type: String, select: false },
  role: { type: String, enum: ['teacher', 'student'], default: 'teacher' },
  // teacherId bắt buộc khi role='teacher', studentId bắt buộc khi role='student' —
  // validate ở controller theo role thay vì required cứng ở schema (2 role dùng
  // chung 1 collection Account để tái dùng toàn bộ logic mật khẩu/khoá tài khoản).
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  mustChangePassword: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

accountSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const plain = this.password;
  this.passwordPlainEnc = encryptPassword(plain);
  this.password = await bcrypt.hash(plain, 12);
});

accountSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Trả về mật khẩu gốc (giải mã) — gọi trên document đã .select({ passwordPlainEnc: 1 }).
accountSchema.methods.getPlainPassword = function () {
  if (!this.passwordPlainEnc) return null;
  return decryptPassword(this.passwordPlainEnc);
};

module.exports = mongoose.model('Account', accountSchema);
