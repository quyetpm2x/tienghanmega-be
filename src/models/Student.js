const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className: String,
  level: String,
  startDate: String,
  status: { type: String, enum: ['active', 'completed', 'reserved', 'transferred', 'dropped'], default: 'active' },
  tuitionStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], default: 'unpaid' },
  amount:      { type: Number, default: 0 },   // tổng đã đóng
  coursePrice: { type: Number, default: 0 },   // học phí khoá học
  note:        { type: String, default: '' },   // ghi chú của admin
  // Mã giới thiệu CỦA học sinh này — người khác nhập mã này lúc đăng ký sẽ
  // được ghi nhận là do học sinh này giới thiệu. Tự sinh khi tạo học sinh
  // (xem utils/referral.js) — không set default '' vì cần sparse unique index
  // hoạt động đúng (bỏ qua field, không phải chuỗi rỗng trùng nhau).
  referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  // Mã giới thiệu học sinh này đã NHẬP lúc đăng ký (nếu có) — referrerModel/
  // referrerId là kết quả tra cứu (resolve) từ mã này, dùng để tính hoa hồng.
  referredByCode: { type: String, default: '', uppercase: true, trim: true },
  referrerModel:  { type: String, enum: ['Student', 'Teacher', null], default: null },
  referrerId:     { type: mongoose.Schema.Types.ObjectId, refPath: 'referrerModel' },
  // Đã tạo ReferralCommission cho người giới thiệu học sinh này hay chưa —
  // chặn tính hoa hồng trùng lặp (xem studentController.maybeCreateCommission).
  commissionCredited: { type: Boolean, default: false },
  transferHistory: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    level: String,
    transferredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
