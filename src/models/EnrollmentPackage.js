const mongoose = require('mongoose');

// Một lần học sinh đăng ký — một hoặc nhiều khoá cùng lúc. Tiền (giá, chiết khấu, điều
// chỉnh "đã nộp") nằm ở ĐÂY chứ không ở từng khoá: học sinh đóng tiền cho cả gói, còn
// phần chia về khoá chỉ để dựng báo cáo (xem utils/packageMath.js).
const packageSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  // listTotal/netTotal lưu sẵn (= Σ ghi danh) để truy vấn báo cáo không phải join.
  listTotal: { type: Number, required: true, min: 0 },
  discount:  { type: Number, default: 0, min: 0 },
  netTotal:  { type: Number, required: true, min: 0 },
  // 'manual' = admin đã tự chia phần giảm cho từng khoá; hệ thống không chia lại đè mất.
  discountAllocation: { type: String, enum: ['auto', 'manual'], default: 'auto' },
  // Phần "đã nộp" không có bản ghi Payment (dữ liệu cũ nhập tay, admin sửa tay).
  // Có thể âm khi tổng Payment cũ lớn hơn số đã nộp từng lưu trên Student.
  paidAdjustment: { type: Number, default: 0 },
  adjustmentHistory: [{
    from: Number,
    to: Number,
    changedBy: String,
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  }],
  // Ngày học sinh ĐĂNG KÝ gói này, dạng "YYYY-MM-DD" (cùng kiểu Enrollment.startDate — chuỗi
  // ngày do người nhập chọn, không phải mốc thời gian nên không cần đổi múi giờ).
  // Mặc định hôm nay lúc tạo, nhưng admin sửa được để nhập bù cho đăng ký cũ.
  // KHÁC createdAt: createdAt là lúc lưu bản ghi, và với gói migrate nó là ngày chạy script
  // chứ không phải ngày đăng ký thật.
  registeredAt: { type: String, default: '' },
  note: { type: String, default: '' },
  // Ảnh chụp Student lúc chuyển đổi dữ liệu — chỉ để đối chiếu, luồng mới không đọc.
  legacy: {
    coursePrice: Number, amount: Number, tuitionStatus: String,
    level: String, className: String, classId: mongoose.Schema.Types.ObjectId, status: String,
  },
  // Khác null = gói sinh ra từ script chuyển đổi (khoá để chạy lại không nhân đôi).
  migratedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model('EnrollmentPackage', packageSchema);
