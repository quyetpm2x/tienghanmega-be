// Lịch sử đóng tiền của MỘT gói cho học sinh xem: khoản thu (có ngày đóng), các lần admin
// ghi nhận thêm bằng tay (ngày ghi nhận) và — nếu còn — phần đã nộp từ dữ liệu cũ không có
// lịch sử. Tổng các dòng luôn bằng số "đã đóng" đang hiển thị. Không trả ghi chú nội bộ hay
// tên admin.
function buildPaymentHistory({ payments = [], adjustmentHistory = [], paid = 0 }) {
  const items = [
    ...payments.map(p => ({ type: 'payment', date: p.paidAt, amount: p.amount || 0 })),
    ...adjustmentHistory
      .map(h => ({ type: 'manual', date: h.changedAt || null, amount: (h.to || 0) - (h.from || 0) }))
      .filter(h => h.amount !== 0),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const recorded = items.reduce((s, i) => s + i.amount, 0);
  const rest = paid - recorded;
  if (rest !== 0) items.push({ type: 'legacy', date: null, amount: rest });
  return items;
}

module.exports = { buildPaymentHistory };
