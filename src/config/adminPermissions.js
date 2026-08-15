// Danh mục quyền admin — nguồn duy nhất cho: (1) middleware permit() chặn ở backend,
// (2) checkbox tree ở trang "Quản trị viên" (FE fetch nguyên catalog này qua API, không
// hardcode lặp lại danh sách quyền ở FE, tránh 2 nơi lệch nhau).
//
// crud: 'view' | 'create' | 'update' | 'delete' — dùng để tô 4 màu chữ khác nhau ở FE.
// super_admin luôn có TẤT CẢ quyền, không đọc từ permissions[] — xem middlewares/permit.js.
//
// Cụm "admins" (quản lý quản trị viên) KHÔNG nằm trong catalog này — chỉ super_admin mới
// được vào, không thể cấp/uỷ quyền qua checkbox (tránh tự leo thang đặc quyền).

const CLUSTERS = [
  { id: 'dashboard', label: 'Tổng quan' },
  { id: 'students', label: 'Học sinh' },
  { id: 'classes', label: 'Lớp học' },
  { id: 'courses', label: 'Khoá học' },
  { id: 'materials', label: 'Tài liệu học tập' },
  { id: 'attendance', label: 'Điểm danh' },
  { id: 'tests', label: 'Bài kiểm tra' },
  { id: 'homework', label: 'Bài tập về nhà' },
  { id: 'calendar', label: 'Lịch tổng hợp' },
  { id: 'finance', label: 'Doanh thu & Chi phí' },
  { id: 'registrations', label: 'Đăng ký / Lead' },
  { id: 'visitors', label: 'Khách truy cập' },
  { id: 'teachers', label: 'Giảng viên' },
  { id: 'faqs', label: 'Câu hỏi FAQ' },
  { id: 'games', label: 'Trò chơi từ vựng' },
  { id: 'studentFeedback', label: 'Đánh giá học sinh' },
  { id: 'affiliate', label: 'Affiliate / Giới thiệu' },
  { id: 'display', label: 'Trang chủ / Hiển thị' },
];

const PERMISSIONS = [
  // ── Tổng quan ─────────────────────────────────────────────────────────────
  { key: 'dashboard.view', cluster: 'dashboard', crud: 'view', label: 'Xem trang tổng quan (dashboard)' },

  // ── Học sinh ──────────────────────────────────────────────────────────────
  { key: 'students.view', cluster: 'students', crud: 'view', label: 'Danh sách học sinh — xem, tìm kiếm, lọc' },
  { key: 'students.create', cluster: 'students', crud: 'create', label: 'Thêm học sinh mới' },
  { key: 'students.update', cluster: 'students', crud: 'update', label: 'Sửa thông tin học sinh' },
  { key: 'students.delete', cluster: 'students', crud: 'delete', label: 'Xoá học sinh' },
  { key: 'students.viewDetail', cluster: 'students', crud: 'view', label: 'Xem chi tiết học sinh' },
  { key: 'students.transfer', cluster: 'students', crud: 'update', label: 'Chuyển lớp học sinh' },
  { key: 'students.viewPayments', cluster: 'students', crud: 'view', label: 'Xem lịch sử thanh toán học phí' },
  { key: 'students.addPayment', cluster: 'students', crud: 'create', label: 'Thêm khoản thu học phí' },
  { key: 'students.manageAccount', cluster: 'students', crud: 'update', label: 'Quản lý tài khoản đăng nhập học sinh (gồm tạo hàng loạt cả lớp, copy username/password)' },
  { key: 'students.generateReferral', cluster: 'students', crud: 'create', label: 'Sinh mã giới thiệu cho học sinh' },

  // ── Lớp học ───────────────────────────────────────────────────────────────
  { key: 'classes.view', cluster: 'classes', crud: 'view', label: 'Danh sách lớp — xem, lọc, sắp xếp' },
  { key: 'classes.create', cluster: 'classes', crud: 'create', label: 'Thêm lớp mới' },
  { key: 'classes.update', cluster: 'classes', crud: 'update', label: 'Sửa thông tin lớp (gồm bật/tắt + sắp xếp hiển thị trang chủ / lịch công khai)' },
  { key: 'classes.delete', cluster: 'classes', crud: 'delete', label: 'Xoá lớp' },
  { key: 'classes.transferTeacher', cluster: 'classes', crud: 'update', label: 'Đổi giáo viên phụ trách' },
  { key: 'classes.editTransferDate', cluster: 'classes', crud: 'update', label: 'Sửa ngày hiệu lực đổi giáo viên' },
  { key: 'classes.undoTransfer', cluster: 'classes', crud: 'update', label: 'Hoàn tác lần đổi giáo viên gần nhất' },
  { key: 'classes.viewDetail', cluster: 'classes', crud: 'view', label: 'Xem chi tiết lớp (học sinh/điểm danh)' },

  // ── Khoá học ──────────────────────────────────────────────────────────────
  { key: 'courses.view', cluster: 'courses', crud: 'view', label: 'Danh sách khoá học' },
  { key: 'courses.create', cluster: 'courses', crud: 'create', label: 'Thêm khoá học' },
  { key: 'courses.update', cluster: 'courses', crud: 'update', label: 'Sửa khoá học' },
  { key: 'courses.delete', cluster: 'courses', crud: 'delete', label: 'Xoá khoá học' },
  { key: 'courses.categoryCreate', cluster: 'courses', crud: 'create', label: 'Thêm danh mục khoá học' },
  { key: 'courses.categoryUpdate', cluster: 'courses', crud: 'update', label: 'Sửa danh mục khoá học' },
  { key: 'courses.categoryDelete', cluster: 'courses', crud: 'delete', label: 'Xoá danh mục khoá học' },

  // ── Tài liệu học tập ──────────────────────────────────────────────────────
  { key: 'materials.view', cluster: 'materials', crud: 'view', label: 'Danh sách tài liệu + thống kê' },
  { key: 'materials.create', cluster: 'materials', crud: 'create', label: 'Thêm tài liệu' },
  { key: 'materials.update', cluster: 'materials', crud: 'update', label: 'Sửa tài liệu' },
  { key: 'materials.delete', cluster: 'materials', crud: 'delete', label: 'Xoá tài liệu' },
  { key: 'materials.reorder', cluster: 'materials', crud: 'update', label: 'Sắp xếp thứ tự tài liệu' },

  // ── Điểm danh ─────────────────────────────────────────────────────────────
  { key: 'attendance.view', cluster: 'attendance', crud: 'view', label: 'Xem điểm danh theo lớp/ngày' },
  { key: 'attendance.record', cluster: 'attendance', crud: 'create', label: 'Ghi nhận điểm danh học sinh' },
  { key: 'attendance.update', cluster: 'attendance', crud: 'update', label: 'Sửa bản ghi điểm danh đã có' },

  // ── Bài kiểm tra ──────────────────────────────────────────────────────────
  { key: 'tests.bankView', cluster: 'tests', crud: 'view', label: 'Ngân hàng câu hỏi — xem + tỉ lệ đúng' },
  { key: 'tests.bankCreate', cluster: 'tests', crud: 'create', label: 'Ngân hàng câu hỏi — thêm' },
  { key: 'tests.bankUpdate', cluster: 'tests', crud: 'update', label: 'Ngân hàng câu hỏi — sửa' },
  { key: 'tests.bankDelete', cluster: 'tests', crud: 'delete', label: 'Ngân hàng câu hỏi — xoá' },
  { key: 'tests.paperView', cluster: 'tests', crud: 'view', label: 'Soạn đề — xem danh sách đề' },
  { key: 'tests.paperCreate', cluster: 'tests', crud: 'create', label: 'Soạn đề mới / tạo đề nhanh' },
  { key: 'tests.paperUpdate', cluster: 'tests', crud: 'update', label: 'Sửa đề / gán đề cho lớp' },
  { key: 'tests.paperDelete', cluster: 'tests', crud: 'delete', label: 'Xoá đề' },
  { key: 'tests.resultView', cluster: 'tests', crud: 'view', label: 'Kết quả — xem bảng điểm, chi tiết lượt làm bài' },
  { key: 'tests.resultCreate', cluster: 'tests', crud: 'create', label: 'Tạo / lên lịch phiên thi' },
  { key: 'tests.resultUpdate', cluster: 'tests', crud: 'update', label: 'Sửa phiên kết quả / chấm tự luận / truất quyền thi' },
  { key: 'tests.resultDelete', cluster: 'tests', crud: 'delete', label: 'Xoá phiên kết quả' },
  { key: 'tests.topikView', cluster: 'tests', crud: 'view', label: 'TOPIK — xem đề thi + lượt làm bài' },
  { key: 'tests.topikCreate', cluster: 'tests', crud: 'create', label: 'TOPIK — thêm đề thi' },
  { key: 'tests.topikUpdate', cluster: 'tests', crud: 'update', label: 'TOPIK — sửa đề / chấm tự luận / đánh dấu liên hệ' },
  { key: 'tests.topikDelete', cluster: 'tests', crud: 'delete', label: 'TOPIK — xoá đề thi' },
  { key: 'tests.placementView', cluster: 'tests', crud: 'view', label: 'Xếp lớp — xem đề test + phiên test' },
  { key: 'tests.placementCreate', cluster: 'tests', crud: 'create', label: 'Xếp lớp — thêm đề, tạo phiên test/link' },
  { key: 'tests.placementUpdate', cluster: 'tests', crud: 'update', label: 'Xếp lớp — sửa đề, chấm, ghi nhận xếp lớp, chuyển thành học sinh' },
  { key: 'tests.placementDelete', cluster: 'tests', crud: 'delete', label: 'Xếp lớp — xoá đề test' },

  // ── Bài tập về nhà (chỉ xem — giảng viên quản lý) ────────────────────────
  { key: 'homework.view', cluster: 'homework', crud: 'view', label: 'Xem danh sách bài giao + nội dung đề' },
  { key: 'homework.viewSubmissions', cluster: 'homework', crud: 'view', label: 'Xem bài nộp + điểm + thắc mắc' },

  // ── Lịch tổng hợp ─────────────────────────────────────────────────────────
  // Chỉ chặn được ở FE (ẩn mục menu) — dữ liệu tổng hợp từ classes/teachers đã có
  // permission riêng, bản thân trang Lịch không có endpoint backend của riêng nó.
  { key: 'calendar.view', cluster: 'calendar', crud: 'view', label: 'Xem lịch dạy tuần/tháng, lọc theo giáo viên' },

  // ── Doanh thu & Chi phí ───────────────────────────────────────────────────
  { key: 'finance.viewOverview', cluster: 'finance', crud: 'view', label: 'Xem tổng quan doanh thu/lợi nhuận' },
  { key: 'finance.viewRevenue', cluster: 'finance', crud: 'view', label: 'Xem bảng doanh thu chi tiết' },
  { key: 'finance.viewExpenses', cluster: 'finance', crud: 'view', label: 'Xem danh sách chi phí' },
  { key: 'finance.createExpense', cluster: 'finance', crud: 'create', label: 'Thêm khoản chi / danh mục chi phí' },
  { key: 'finance.updateExpense', cluster: 'finance', crud: 'update', label: 'Sửa khoản chi' },
  { key: 'finance.deleteExpense', cluster: 'finance', crud: 'delete', label: 'Xoá khoản chi' },

  // ── Đăng ký / Lead ────────────────────────────────────────────────────────
  { key: 'registrations.view', cluster: 'registrations', crud: 'view', label: 'Danh sách đơn đăng ký — xem, lọc, chi tiết' },
  { key: 'registrations.updateStatus', cluster: 'registrations', crud: 'update', label: 'Đổi trạng thái / đánh dấu liên hệ-nhập học / huỷ đơn' },
  { key: 'registrations.convert', cluster: 'registrations', crud: 'create', label: 'Chuyển đổi đơn thành học sinh' },
  { key: 'registrations.delete', cluster: 'registrations', crud: 'delete', label: 'Xoá vĩnh viễn đơn đăng ký' },

  // ── Khách truy cập ────────────────────────────────────────────────────────
  { key: 'visitors.view', cluster: 'visitors', crud: 'view', label: 'Xem thống kê + bảng chi tiết lượt truy cập' },

  // ── Giảng viên ────────────────────────────────────────────────────────────
  // teachers.view: dữ liệu này công khai (trang chủ cũng hiển thị), backend không
  // chặn GET — key này chỉ dùng để FE ẩn/hiện mục menu "Giảng viên".
  { key: 'teachers.view', cluster: 'teachers', crud: 'view', label: 'Danh sách giảng viên — xem, tìm kiếm' },
  { key: 'teachers.create', cluster: 'teachers', crud: 'create', label: 'Thêm giảng viên' },
  { key: 'teachers.update', cluster: 'teachers', crud: 'update', label: 'Sửa hồ sơ giảng viên (gồm ghi chú nội bộ)' },
  { key: 'teachers.delete', cluster: 'teachers', crud: 'delete', label: 'Cho giảng viên nghỉ việc / khôi phục' },
  { key: 'teachers.manageAccount', cluster: 'teachers', crud: 'update', label: 'Quản lý tài khoản đăng nhập giảng viên' },
  { key: 'teachers.generateReferral', cluster: 'teachers', crud: 'create', label: 'Sinh mã giới thiệu cho giảng viên' },
  { key: 'teachers.viewSchedule', cluster: 'teachers', crud: 'view', label: 'Xem lịch dạy / buổi dạy / thống kê giáo viên' },
  { key: 'teachers.createSession', cluster: 'teachers', crud: 'create', label: 'Thêm buổi dạy thủ công (dùng chung cho tab Điểm danh của Lớp và tab Buổi dạy của Giảng viên)' },
  { key: 'teachers.updateSession', cluster: 'teachers', crud: 'update', label: 'Đổi trạng thái / dời lịch buổi dạy' },
  { key: 'teachers.deleteSession', cluster: 'teachers', crud: 'delete', label: 'Xoá buổi dạy' },
  { key: 'teachers.configPayroll', cluster: 'teachers', crud: 'update', label: 'Cấu hình ngày bắt đầu kỳ lương' },
  { key: 'teachers.viewSalary', cluster: 'teachers', crud: 'view', label: 'Xem báo cáo/biểu đồ lương' },
  { key: 'teachers.createBonus', cluster: 'teachers', crud: 'create', label: 'Thêm khoản thưởng/phạt' },
  { key: 'teachers.updateBonus', cluster: 'teachers', crud: 'update', label: 'Sửa khoản thưởng/phạt' },
  { key: 'teachers.deleteBonus', cluster: 'teachers', crud: 'delete', label: 'Xoá khoản thưởng/phạt' },
  { key: 'teachers.viewPayroll', cluster: 'teachers', crud: 'view', label: 'Xem bảng lương (Payroll)' },
  { key: 'teachers.recordPayment', cluster: 'teachers', crud: 'update', label: 'Ghi nhận/sửa thanh toán lương' },

  // ── Câu hỏi FAQ ───────────────────────────────────────────────────────────
  { key: 'faqs.view', cluster: 'faqs', crud: 'view', label: 'Danh sách FAQ' },
  { key: 'faqs.create', cluster: 'faqs', crud: 'create', label: 'Thêm câu hỏi' },
  { key: 'faqs.update', cluster: 'faqs', crud: 'update', label: 'Sửa câu hỏi / ẩn-hiện' },
  { key: 'faqs.delete', cluster: 'faqs', crud: 'delete', label: 'Xoá câu hỏi' },

  // ── Trò chơi từ vựng ──────────────────────────────────────────────────────
  // games.view: GET /vocab công khai (trang /games cũng dùng), backend không chặn
  // — key này chỉ dùng để FE ẩn/hiện mục menu "Trò chơi từ vựng".
  { key: 'games.view', cluster: 'games', crud: 'view', label: 'Danh sách từ vựng theo game' },
  { key: 'games.create', cluster: 'games', crud: 'create', label: 'Thêm từ (đơn lẻ + hàng loạt/Excel)' },
  { key: 'games.update', cluster: 'games', crud: 'update', label: 'Sửa từ' },
  { key: 'games.delete', cluster: 'games', crud: 'delete', label: 'Xoá từ' },

  // ── Đánh giá học sinh ─────────────────────────────────────────────────────
  { key: 'studentFeedback.view', cluster: 'studentFeedback', crud: 'view', label: 'Danh sách đánh giá' },
  { key: 'studentFeedback.delete', cluster: 'studentFeedback', crud: 'delete', label: 'Xoá đánh giá' },

  // ── Affiliate / Giới thiệu ────────────────────────────────────────────────
  // Ghi chú: "Mã giới thiệu" và "Lịch sử" là 2 cách xem khác nhau của cùng dữ liệu
  // học sinh/giảng viên/hoa hồng đã có (students.view/teachers.view/generateReferral,
  // affiliate.viewCommissions) — không có endpoint riêng, không tạo permission riêng
  // để tránh "quyền giả" (tick mà không chặn được gì độc lập).
  { key: 'affiliate.viewCommissions', cluster: 'affiliate', crud: 'view', label: 'Xem danh sách hoa hồng + lịch sử giới thiệu' },
  { key: 'affiliate.updateCommissions', cluster: 'affiliate', crud: 'update', label: 'Đánh dấu đã/chưa thanh toán hoa hồng' },

  // ── Trang chủ / Hiển thị ──────────────────────────────────────────────────
  { key: 'display.storiesView', cluster: 'display', crud: 'view', label: 'Câu chuyện thành công — xem danh sách' },
  { key: 'display.storiesCreate', cluster: 'display', crud: 'create', label: 'Câu chuyện thành công — thêm video' },
  { key: 'display.storiesUpdate', cluster: 'display', crud: 'update', label: 'Câu chuyện thành công — sửa video' },
  { key: 'display.storiesDelete', cluster: 'display', crud: 'delete', label: 'Câu chuyện thành công — xoá video' },
  { key: 'display.communityView', cluster: 'display', crud: 'view', label: 'Cộng đồng — xem danh sách' },
  { key: 'display.communityCreate', cluster: 'display', crud: 'create', label: 'Cộng đồng — thêm ảnh liên kết' },
  { key: 'display.communityUpdate', cluster: 'display', crud: 'update', label: 'Cộng đồng — sửa / sắp xếp thứ tự' },
  { key: 'display.communityDelete', cluster: 'display', crud: 'delete', label: 'Cộng đồng — xoá ảnh liên kết' },
  { key: 'display.feedbackView', cluster: 'display', crud: 'view', label: 'Feedback video/ảnh — xem danh sách' },
  { key: 'display.feedbackCreate', cluster: 'display', crud: 'create', label: 'Feedback video/ảnh — thêm' },
  { key: 'display.feedbackUpdate', cluster: 'display', crud: 'update', label: 'Feedback video/ảnh — sửa / sắp xếp' },
  { key: 'display.feedbackDelete', cluster: 'display', crud: 'delete', label: 'Feedback video/ảnh — xoá' },
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map(p => p.key));

module.exports = { CLUSTERS, PERMISSIONS, PERMISSION_KEYS };
