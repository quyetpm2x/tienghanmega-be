const Student = require('../models/Student');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { buildPaymentHistory } = require('../utils/paymentHistory');
const StudentFeedback = require('../models/StudentFeedback');
const { generateUniqueReferralCode, buildMyReferrals } = require('../utils/referral');
const { packagesWithState, isActiveInClass } = require('../utils/enrollment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Everything in this controller derives its scope from req.studentAccount
// (set by protectStudent) — a student only ever sees their own record.

// Không trả `note` (ghi chú nội bộ) và các trường cũ một-lớp-một-học-phí.
const STUDENT_FIELDS = 'name phone email status';
const CLASS_FIELDS = 'name course teacher days time startDate endDate status color';

exports.getMe = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const student = await Student.findById(studentId).select(STUDENT_FIELDS).lean();
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));
  const [byStudent, payments, enrollments] = await Promise.all([
    packagesWithState([studentId]),
    Payment.find({ studentId, packageId: { $ne: null } }).select('packageId amount paidAt').lean(),
    Enrollment.find({ studentId, status: 'active' }).select('classId status startDate')
      .populate('classId', CLASS_FIELDS).sort({ startDate: 1 }).lean(),
  ]);
  // Học sinh xem được học phí của gói (tổng, giảm, phải thu, đã đóng, còn nợ), lịch sử đóng
  // tiền và trạng thái/ngày bắt đầu của từng khoá — không thấy phần chia giảm nội bộ.
  const packages = (byStudent.get(String(studentId)) || []).map(p => ({
    _id: p._id, listTotal: p.listTotal, discount: p.discount, netTotal: p.netTotal,
    paid: p.paid, debt: p.debt, tuitionStatus: p.tuitionStatus, createdAt: p.createdAt,
    courses: p.enrollments.map(e => ({
      _id: e._id, className: e.className, courseTitle: e.courseTitle, status: e.status,
      startDate: e.startDate, hasClass: !!e.classId,
    })),
    paymentHistory: buildPaymentHistory({
      payments: payments.filter(x => String(x.packageId) === String(p._id)),
      adjustmentHistory: p.adjustmentHistory || [],
      paid: p.paid,
    }),
  }));
  success(res, { ...student, packages, enrollments });
};

// Phản hồi của học sinh cho TỪNG lớp đang học (null = chưa gửi) — để prefill form.
exports.getMyFeedback = async (req, res) => {
  const studentId = req.studentAccount.studentId._id;
  const enrollments = await Enrollment.find({ studentId, status: 'active', classId: { $ne: null } })
    .select('classId').populate('classId', 'name teacher').lean();
  const classIds = enrollments.map(e => e.classId && e.classId._id).filter(Boolean);
  const feedbacks = await StudentFeedback.find({ studentId, classId: { $in: classIds } }).lean();
  const byClass = new Map(feedbacks.map(f => [String(f.classId), f]));
  success(res, enrollments.filter(e => e.classId).map(e => ({
    classId: e.classId._id,
    className: e.classId.name,
    teacher: e.classId.teacher || '',
    feedback: byClass.get(String(e.classId._id)) || null,
  })));
};

// Gửi/cập nhật phản hồi cho MỘT lớp đang học — upsert theo (studentId, classId).
exports.submitFeedback = async (req, res, next) => {
  const studentId = req.studentAccount.studentId._id;
  const { rating, content, classId } = req.body;
  const numRating = Number(rating);
  // Cho phép nửa sao (VD 3.5) — chỉ cần là bội số của 0.5 trong khoảng 1-5.
  const isHalfStep = Math.round(numRating * 2) === numRating * 2;
  if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5 || !isHalfStep) {
    return next(new AppError('Vui lòng chọn số sao đánh giá từ 1 đến 5 (có thể chọn nửa sao)', 400));
  }
  if (!classId) return next(new AppError('Vui lòng chọn lớp muốn gửi phản hồi', 400));
  if (!(await isActiveInClass(studentId, classId))) {
    return next(new AppError('Bạn không học lớp này nên chưa thể gửi phản hồi', 400));
  }
  const feedback = await StudentFeedback.findOneAndUpdate(
    { studentId, classId },
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
