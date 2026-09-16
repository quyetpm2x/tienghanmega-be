const AppError = require('./AppError');
const { vnDateStr } = require('./revenueModel');

// Khoản chi chỉ có MỘT mốc thời gian: NGÀY CHI. Trường `month` giữ lại cho dữ liệu cũ và cho
// truy vấn nhanh, nhưng luôn do backend suy ra từ ngày chi — client không đặt được, để không
// còn cảnh "nhãn tháng 9 nhưng chi ngày 16/08" làm lệch báo cáo.
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function monthOfPaidAt(paidAt) {
  const raw = typeof paidAt === 'string' ? paidAt : new Date(paidAt).toISOString();
  if (!DATE_RE.test(raw)) throw new AppError('Ngày chi không hợp lệ', 400);
  // Chuỗi "YYYY-MM-DD" là ngày theo giờ VN người dùng chọn — cắt thẳng, không đổi múi giờ.
  return typeof paidAt === 'string' && DATE_RE.test(paidAt)
    ? paidAt.slice(0, 7)
    : vnDateStr(paidAt).slice(0, 7);
}

// partial = true: dùng cho sửa (chỉ kiểm tra những trường được gửi lên).
function normalizeExpenseBody(body = {}, { partial = false } = {}) {
  const out = {};
  const has = k => body[k] !== undefined && body[k] !== null && body[k] !== '';

  if (has('paidAt')) {
    out.paidAt = body.paidAt;
    out.month = monthOfPaidAt(body.paidAt);
  } else if (!partial) {
    throw new AppError('Vui lòng chọn ngày chi', 400);
  }

  if (has('amount')) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Số tiền phải lớn hơn 0', 400);
    out.amount = amount;
  } else if (!partial) {
    throw new AppError('Vui lòng nhập số tiền', 400);
  }

  if (has('category')) out.category = body.category;
  else if (!partial) throw new AppError('Vui lòng chọn loại chi phí', 400);

  if (body.note !== undefined) out.note = body.note;
  return out;
}

module.exports = { normalizeExpenseBody, monthOfPaidAt };
