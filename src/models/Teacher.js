const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true }, // tên riêng — không dịch
  nat: { type: String, enum: ['vn', 'kr'], default: 'vn' },
  cert: i18nField(),
  // Thành tích/mô tả — danh sách nhiều dòng, đa ngôn ngữ (ko tuỳ chọn, không
  // bắt buộc phải dịch từng dòng). Khác i18nField() (chỉ cho string đơn) vì
  // đây là mảng nhiều dòng.
  credentials: {
    vi: { type: [String], default: [] },
    ko: { type: [String], default: [] },
  },
  spec: i18nField(),
  color: String,
  src: i18nField(),
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
