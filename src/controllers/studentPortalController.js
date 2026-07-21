const Student = require('../models/Student');
const StudentFeedback = require('../models/StudentFeedback');
const { generateUniqueReferralCode, buildMyReferrals } = require('../utils/referral');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Everything in this controller derives its scope from req.studentAccount
// (set by protectStudent) — a student only ever sees their own record.

// Whitelist — không trả về `note` (ghi chú nội bộ của admin/giáo viên về học
// sinh này, không phải thông tin dành cho học sinh tự xem).
const STUDENT_FIELDS = 'name phone email className classId level startDate status tuitionStatus amount coursePrice transferHistory';
const CLASS_FIELDS = 'name course teacher days time startDate endDate status color';

exports.getMe = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const student = await Student.findById(studentId).select(STUDENT_FIELDS).populate('classId', CLASS_FIELDS);
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));
  success(res, student);
};

// Phản hồi của chính học sinh này cho lớp đang học (nếu đã gửi) — dùng để
// prefill lại form khi quay lại trang, cho phép sửa thay vì gửi trùng.
exports.getMyFeedback = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const student = await Student.findById(studentId).select('classId');
  if (!student?.classId) return success(res, null);
  const feedback = await StudentFeedback.findOne({ studentId, classId: student.classId });
  success(res, feedback);
};

// Gửi/cập nhật phản hồi (1 đánh giá sao + nội dung) cho lớp đang học hiện tại
// — upsert theo (studentId, classId) nên gửi lại chỉ cập nhật, không tạo trùng.
exports.submitFeedback = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const { rating, content } = req.body;
  const numRating = Number(rating);
  // Cho phép nửa sao (VD 3.5) — chỉ cần là bội số của 0.5 trong khoảng 1-5.
  const isHalfStep = Math.round(numRating * 2) === numRating * 2;
  if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5 || !isHalfStep) {
    return next(new AppError('Vui lòng chọn số sao đánh giá từ 1 đến 5 (có thể chọn nửa sao)', 400));
  }
  const student = await Student.findById(studentId).select('classId');
  if (!student?.classId) return next(new AppError('Bạn chưa được xếp vào lớp học nào, chưa thể gửi phản hồi', 400));

  const feedback = await StudentFeedback.findOneAndUpdate(
    { studentId, classId: student.classId },
    { rating: numRating, content: (content || '').trim() },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  success(res, feedback, 'Đã gửi phản hồi, cảm ơn bạn!');
};

// Mã giới thiệu của chính học sinh này + toàn bộ danh sách học sinh đã dùng mã
// này khi đăng ký — kể cả những người CHƯA đóng đủ học phí (chưa phát sinh hoa
// hồng), để học sinh biết mã của mình đã được dùng chứ không chỉ thấy lúc có tiền.
exports.getMyReferrals = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const student = await Student.findById(studentId).select('referralCode');
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));
  // Tài khoản tạo trước khi có tính năng này có thể chưa có mã — tự sinh
  // ngay khi học sinh vào xem trang, không bắt buộc phải chờ admin backfill.
  if (!student.referralCode) {
    student.referralCode = await generateUniqueReferralCode();
    await student.save();
  }
  const referrals = await buildMyReferrals('Student', studentId);
  success(res, { referralCode: student.referralCode, referrals });
};
