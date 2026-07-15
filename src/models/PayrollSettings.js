const mongoose = require('mongoose');

// Singleton — chỉ 1 document duy nhất trong collection này. Quyết định ngày
// bắt đầu chu kỳ trả lương (mặc định 10 → 9 tháng sau), áp dụng cho toàn bộ
// tính toán buổi dạy/lương/thanh toán của giáo viên trên web.
const payrollSettingsSchema = new mongoose.Schema({
  startDay: { type: Number, default: 10, min: 1, max: 28 },
}, { timestamps: true });

module.exports = mongoose.model('PayrollSettings', payrollSettingsSchema);
