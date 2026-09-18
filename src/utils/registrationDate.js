const AppError = require('./AppError');

// Ngày ĐĂNG KÝ của gói: chuỗi "YYYY-MM-DD" do người nhập chọn, không phải mốc thời gian.
// Cùng kiểu với Enrollment.startDate nên so sánh/sắp xếp bằng chuỗi là đủ, không đổi múi giờ.
const VALID = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Hôm nay theo GIỜ VIỆT NAM. Dùng toISOString() thẳng của máy chủ sẽ ra ngày hôm trước khi
// server chạy ở múi giờ âm — đăng ký lúc sáng sớm sẽ bị ghi lùi một ngày.
function vnToday(now = Date.now()) {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// Bỏ trống → hôm nay. Có giá trị → bắt buộc đúng dạng, không tự đoán để khỏi ghi nhầm ngày.
function normalizeRegisteredAt(raw, now = Date.now()) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return vnToday(now);
  if (!VALID.test(v)) throw new AppError('Ngày đăng ký phải có dạng YYYY-MM-DD', 400);
  return v;
}

module.exports = { vnToday, normalizeRegisteredAt };
