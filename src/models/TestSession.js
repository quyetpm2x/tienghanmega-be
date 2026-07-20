const mongoose = require('mongoose');

// Phiên thi do ADMIN tạo cho 1 lớp: admin chọn lớp + chọn tập đề (activeTestIds)
// trong kho đề của lớp (poolTestIds = toàn bộ đề đã gán cho lớp tại thời điểm
// tạo phiên, chụp lại — không tự đổi theo nếu Test.assignedClassIds đổi sau
// đó). Phiên mới tạo ở trạng thái 'draft' (chưa có giờ) — giáo viên chỉ có
// nhiệm vụ đặt openAt/endAt/allowRetake rồi "mở phiên", không được đổi đề.
// Mỗi học sinh sẽ được random 1 đề CỤ THỂ trong activeTestIds khi bắt đầu làm
// bài (lưu vào TestAttempt.testId, không lưu ở đây).
const testSessionSchema = new mongoose.Schema({
  // Tên phiên do admin đặt (VD "Kiểm tra giữa kỳ - Đợt 1") — để phân biệt các
  // phiên với nhau khi hiển thị, tách biệt với tên các đề cụ thể trong activeTestIds.
  title: { type: String, default: '' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  poolTestIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Test' }],
  activeTestIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Test' }],
  status: { type: String, enum: ['draft', 'pending', 'open', 'closed'], default: 'draft' },
  openAt: { type: String, default: '' },
  // Giờ kết thúc DỰ KIẾN do giáo viên đặt (tuỳ chọn) — sau giờ này học sinh
  // không bắt đầu làm bài mới được nữa (effectiveStatus tự chuyển 'closed'),
  // khác với closedAt là mốc ghi lại lúc giáo viên BẤM đóng phiên thủ công.
  endAt: { type: String, default: '' },
  closedAt: { type: String, default: '' },
  allowRetake: { type: Boolean, default: false },
  // Học sinh bị đình chỉ thi cho phiên này — chặn bắt đầu/tiếp tục làm bài,
  // đặt trước khi học sinh có attempt cũng có tác dụng (chặn ngay từ đầu).
  disqualifiedStudentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
}, { timestamps: true });

module.exports = mongoose.model('TestSession', testSessionSchema);
