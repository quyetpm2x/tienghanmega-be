const mongoose = require('mongoose');

// 1 giao dịch hoa hồng giới thiệu — tạo TỰ ĐỘNG khi 1 học sinh được giới
// thiệu (Student.referrerModel/referrerId) chuyển sang trạng thái đang học
// ('active') VÀ đã đóng đủ học phí ('paid'), xem studentController.js. Admin
// theo dõi/đánh dấu đã trả qua model này (trang Quản lý affiliate).
const referralCommissionSchema = new mongoose.Schema({
  referrerModel: { type: String, enum: ['Student', 'Teacher'], required: true },
  referrerId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'referrerModel' },
  referredStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  basePrice: { type: Number, required: true }, // coursePrice dùng để tính hoa hồng tại thời điểm phát sinh
  rate:      { type: Number, default: 0.1 },
  amount:    { type: Number, required: true }, // basePrice * rate
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paidAt: { type: Date, default: null },
  note:   { type: String, default: '' },
}, { timestamps: true });

// 1 học sinh được giới thiệu chỉ tạo ra ĐÚNG 1 giao dịch hoa hồng — chặn tính
// trùng nếu tuitionStatus bị đổi qua lại (paid -> partial -> paid...).
referralCommissionSchema.index({ referredStudentId: 1 }, { unique: true });

module.exports = mongoose.model('ReferralCommission', referralCommissionSchema);
