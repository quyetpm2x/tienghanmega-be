// Lịch sử đóng tiền của MỘT gói cho học sinh xem: khoản thu (có ngày đóng), các lần admin
// ghi nhận thêm bằng tay (ngày ghi nhận) và — nếu còn — phần đã nộp từ dữ liệu cũ không có
// lịch sử. Tổng các dòng luôn bằng số "đã đóng" đang hiển thị. Không trả ghi chú nội bộ hay
// tên admin.
// legacyDate: dữ liệu cũ không lưu ngày đóng — lấy ngày thêm học sinh làm ngày ước tính
// (admin nhập tiền cọc ngay lúc thêm học sinh). Không có thì để trống như trước.
function buildPaymentHistory({ payments = [], adjustmentHistory = [], paid = 0, legacyDate = null }) {
  const items = [
    ...payments.map(p => ({ type: 'payment', date: p.paidAt, amount: p.amount || 0 })),
    ...adjustmentHistory
      .map(h => ({ type: 'manual', date: h.changedAt || null, amount: (h.to || 0) - (h.from || 0) }))
      .filter(h => h.amount !== 0),
  ];
  const recorded = items.reduce((s, i) => s + i.amount, 0);
  const rest = paid - recorded;
  if (rest !== 0) items.push({ type: 'legacy', date: legacyDate || null, amount: rest, ...(legacyDate ? { dateEstimated: true } : {}) });
  return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

// Bản cho ADMIN: cùng cách gộp nhưng giữ ghi chú, tên người sửa và gắn gói/lớp để hiện trong
// modal học sinh. Tổng các dòng vẫn luôn bằng số "đã nộp".
function buildAdminPaymentHistory({ packageId = null, packageLabel = '', className = '', payments = [], adjustmentHistory = [], paid = 0, legacyDate = null }) {
  const tag = item => ({ ...item, packageId: packageId ? String(packageId) : null, packageLabel, className });
  const items = [
    ...payments.map(p => tag({
      type: 'payment', _id: String(p._id), date: p.paidAt, amount: p.amount || 0, note: p.note || '',
      // Cùng tên trường với dòng "sửa tay" để màn hình hiện "ai ghi nhận" theo một đường duy nhất.
      changedBy: p.recordedBy || '',
    })),
    ...adjustmentHistory
      .map(h => tag({
        type: 'manual', date: h.changedAt || null, amount: (h.to || 0) - (h.from || 0),
        note: h.note || '', changedBy: h.changedBy || '',
      }))
      .filter(h => h.amount !== 0),
  ];
  const rest = paid - items.reduce((s, i) => s + i.amount, 0);
  if (rest !== 0) items.push(tag({ type: 'legacy', date: legacyDate || null, amount: rest, note: '', ...(legacyDate ? { dateEstimated: true } : {}) }));
  return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

module.exports = { buildPaymentHistory, buildAdminPaymentHistory };
