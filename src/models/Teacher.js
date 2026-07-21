const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nat: { type: String, enum: ['vn', 'kr'], default: 'vn' },
  cert: String,
  credentials: [String],
  spec: String,
  color: String,
  src: String,
  isActive: { type: Boolean, default: true },
  // admin extended fields
  classes: [String],
  phone: String,
  rating: { type: Number, default: 5.0 },
  startDate: String,
  totalPaidSalary: { type: Number, default: 0 },
  totalSessions: { type: Number, default: 0 },
  monthSessions: { type: Number, default: 0 },
  adminNote: String,
  order: { type: Number, default: null },
  // Mã giới thiệu CỦA giảng viên này — học sinh nhập mã này lúc đăng ký sẽ
  // ghi nhận giảng viên là người giới thiệu, nhận 10% hoa hồng học phí (xem
  // utils/referral.js + models/ReferralCommission.js). Tự sinh khi tạo giảng viên.
  referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Teacher', teacherSchema);
