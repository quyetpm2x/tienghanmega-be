// Trạng thái hiệu lực của 1 phiên kiểm tra — dùng chung cho admin/giáo viên/học sinh.
// draft (admin vừa tạo, giáo viên chưa đặt giờ) đứng trên hết vì chưa có
// openAt hợp lệ để tính theo thời gian; sau đó closed (đã đóng thủ công) luôn
// ưu tiên cao nhất; rồi nếu đã đặt endAt và đã qua giờ đó thì tự chuyển closed
// (không cần giáo viên bấm đóng tay); còn lại open nếu đã tới/qua openAt,
// ngược lại pending (đã đặt giờ nhưng chưa tới giờ mở).
function effectiveStatus(session) {
  if (session.status === 'draft') return 'draft';
  if (session.status === 'closed') return 'closed';
  const now = new Date();
  if (session.endAt && new Date(session.endAt) <= now) return 'closed';
  if (session.openAt && new Date(session.openAt) <= now) return 'open';
  return 'pending';
}

module.exports = { effectiveStatus };
