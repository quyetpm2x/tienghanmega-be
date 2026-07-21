const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  level: { type: String, required: true },
  course: String,
  note: String,
  // Mã giới thiệu học viên tiềm năng nhập lúc đăng ký (nếu có) — chỉ lưu để
  // admin tham khảo, KHÔNG tự động tính hoa hồng ở đây (Registration chưa
  // phải là Student thật, admin tạo Student thủ công rồi nhập lại mã này).
  referralCode: { type: String, default: '' },
  // lead tracking
  time: String,
  source: { type: String, default: 'Website' },
  status: { type: String, enum: ['new', 'contacted', 'enrolled', 'cancelled'], default: 'new' },
  // Đã được admin chuyển thành 1 Student thật hay chưa — set khi bấm "Chuyển
  // thành học sinh" ở trang Đơn đăng ký, tránh chuyển trùng lặp 1 đơn nhiều lần.
  convertedStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  // location from IP
  ip:          String,
  country:     String,
  countryCode: String,
  city:        String,
  isp:         String,
}, { timestamps: true });

module.exports = mongoose.model('Registration', registrationSchema);
