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

module.exports = { verifiedAfterUpsert, isAbnormalPayment };
