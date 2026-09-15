const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  // ── Trường CŨ (một lớp — một học phí). Từ khi có EnrollmentPackage/Enrollment,
  // luồng mới KHÔNG đọc/ghi các trường classId, className, level, startDate,
  // tuitionStatus, amount, coursePrice, amountHistory, transferHistory. Giữ lại làm
  // bản gốc đối chiếu sau chuyển đổi và để quay lui. ──
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  className: String,
  level: String,
  startDate: String,
  status: { type: String, enum: ['active', 'unassigned', 'completed', 'reserved', 'transferred', 'dropped'], default: 'active' },
  // KHÔNG còn dùng: trạng thái học sinh luôn tự suy từ các ghi danh (còn ít nhất một khoá
  // đang học thì là đang học — utils/packageMath.deriveStudentStatus). Giữ trường để không
  // mất dữ liệu cũ; luồng ghi mới luôn đặt về false.
  statusManual: { type: Boolean, default: false },
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
  // chặn tính hoa hồng trùng lặp (xem services/studentEnrollmentService.maybeCreateCommission).
  commissionCredited: { type: Boolean, default: false },
  // Vết sửa tay ô "số tiền đã nộp" ở form học sinh. Tiền vào qua nút "Thêm khoản thu"
  // đã có bảng Payment riêng; sửa tay chỉ đổi mỗi con số nên cần lịch sử riêng để biết
  // ai đổi, từ bao nhiêu sang bao nhiêu, lúc nào.
  amountHistory: [{
    from: Number,
    to: Number,
    changedBy: String,   // tên admin tại thời điểm sửa (ảnh chụp, không tham chiếu)
    changedAt: { type: Date, default: Date.now },
  }],
  transferHistory: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    level: String,
    transferredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
