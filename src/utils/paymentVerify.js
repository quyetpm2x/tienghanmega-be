// "Đã kiểm" là admin xác nhận cho MỘT số tiền cụ thể: sửa số tiền đã trả thì phải kiểm lại,
// còn sửa mỗi ghi chú (lý do chênh lệch) thì giữ nguyên.
function verifiedAfterUpsert(existing, next) {
  if (!existing || !existing.verified) return false;
  return (existing.amountPaid || 0) === (next.amountPaid || 0);
}

// Lương bất thường = số tiền trả khác số tự tính. Số tự tính có thể lẻ (hoa hồng theo %),
// nên lệch dưới 1đ coi như bằng.
function isAbnormalPayment(computed, amountPaid) {
  return Math.abs((computed || 0) - (amountPaid || 0)) >= 1;
}

// Sửa khoá học của lớp làm đổi số lương TỰ TÍNH của một kỳ — khoản đã được admin "đã kiểm"
// trước đó là duyệt cho MỘT con số nay không còn đúng nữa, phải kiểm lại. Trả về filter của
// những khoản trả cần bỏ cờ; nhãn kỳ dạng "2026-08" ứng với periodStart "2026-08-<startDay>".
function paymentsToUnverify(periodLabels, startDay, teacherIds) {
  const day = String(startDay).padStart(2, '0');
  const f = { periodStart: { $in: (periodLabels || []).map(l => `${l}-${day}`) }, verified: true };
  // Chỉ những giảng viên thật sự liên quan — bỏ cờ cả kỳ sẽ bắt admin kiểm lại tay khoản
  // trả của mọi giảng viên khác.
  if (teacherIds && teacherIds.length) f.teacherId = { $in: teacherIds };
  return f;
}

module.exports = { verifiedAfterUpsert, isAbnormalPayment, paymentsToUnverify };
