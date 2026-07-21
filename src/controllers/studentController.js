const Student = require('../models/Student');
const Payment = require('../models/Payment');
const ReferralCommission = require('../models/ReferralCommission');
const { generateUniqueReferralCode, resolveReferrer, COMMISSION_RATE } = require('../utils/referral');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Nếu req.body có field referredByCode (kể cả khi tạo mới lẫn khi sửa), tra
// cứu xem mã này thuộc học sinh/giảng viên nào rồi gán vào student (chưa
// save). Trả về AppError nếu mã không tồn tại, null nếu hợp lệ/không đổi gì.
async function applyReferredByCode(student, body) {
  if (!('referredByCode' in body)) return null;
  const raw = (body.referredByCode || '').trim();
  if (!raw) {
    student.referredByCode = '';
    student.referrerModel = null;
    student.referrerId = undefined;
    return null;
  }
  const referrer = await resolveReferrer(raw);
  if (!referrer) return new AppError('Mã giới thiệu không tồn tại', 400);
  if (referrer.model === 'Student' && String(referrer.id) === String(student._id)) {
    return new AppError('Không thể tự nhập mã giới thiệu của chính mình', 400);
  }
  student.referredByCode = raw.toUpperCase();
  student.referrerModel = referrer.model;
  student.referrerId = referrer.id;
  return null;
}

// Học sinh đang học ('active') + đã đóng đủ học phí ('paid') + có người giới
// thiệu hợp lệ + CHƯA từng tính hoa hồng cho lượt này -> tạo 1 ReferralCommission
// (10% coursePrice) và đánh dấu đã tính để không lặp lại (VD: paid -> partial -> paid).
async function maybeCreateCommission(student) {
  if (student.status !== 'active') return;
  if (student.tuitionStatus !== 'paid') return;
  if (!student.referrerModel || !student.referrerId) return;
  if (student.commissionCredited) return;
  const basePrice = student.coursePrice || 0;
  if (basePrice <= 0) return;
  await ReferralCommission.create({
    referrerModel: student.referrerModel,
    referrerId: student.referrerId,
    referredStudentId: student._id,
    basePrice,
    rate: COMMISSION_RATE,
    amount: Math.round(basePrice * COMMISSION_RATE),
  });
  student.commissionCredited = true;
}

function getCourseCategory(level) {
  if (!level) return 'conversation';
  const l = level.toLowerCase();
  if (l.includes('sơ cấp') || l.includes('so cap')) return 'beginner';
  if (l.includes('trung cấp') || l.includes('trung cap')) return 'intermediate';
  if (l.includes('topik') || l.includes('lộ trình') || l.includes('lo trinh')) return 'topik';
  return 'conversation';
}

exports.getAll = async (req, res) => {
  const { className, tuitionStatus } = req.query;
  const filter = {};
  if (className) filter.className = className;
  if (tuitionStatus) filter.tuitionStatus = tuitionStatus;
  const students = await Student.find(filter).sort({ createdAt: -1 });
  success(res, students);
};

exports.getOne = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  success(res, student);
};

exports.create = async (req, res, next) => {
  const student = new Student(req.body);
  student.referralCode = await generateUniqueReferralCode();
  const refErr = await applyReferredByCode(student, req.body);
  if (refErr) return next(refErr);
  await maybeCreateCommission(student); // phòng trường hợp tạo thẳng với status active + đã đóng đủ + có người giới thiệu
  await student.save();
  success(res, student, 'Thêm học viên thành công', 201);
};

exports.update = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  const refErr = await applyReferredByCode(student, req.body);
  if (refErr) return next(refErr);
  // referralCode/referrerModel/referrerId/commissionCredited chỉ được hệ thống
  // tự set (qua applyReferredByCode/generateReferralCode/maybeCreateCommission),
  // không cho client ghi đè trực tiếp qua form sửa thông tin thông thường.
  const { referredByCode, referrerModel, referrerId, referralCode, commissionCredited, ...rest } = req.body;
  Object.assign(student, rest);
  await maybeCreateCommission(student);
  await student.save();
  success(res, student, 'Cập nhật thành công');
};

// POST /admin/students/:id/referral-code — sinh mã giới thiệu cho học sinh
// CHƯA có mã (idempotent: đã có mã thì trả về mã hiện tại, không sinh lại).
exports.generateReferralCode = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  if (!student.referralCode) {
    student.referralCode = await generateUniqueReferralCode();
    await student.save();
  }
  success(res, student, 'Đã tạo mã giới thiệu');
};

exports.remove = async (req, res, next) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  success(res, null, 'Xóa thành công');
};

exports.transfer = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  const { classId, className, level } = req.body;
  if (!className) return next(new AppError('Thiếu thông tin lớp mới', 400));

  student.transferHistory = student.transferHistory || [];
  student.transferHistory.push({
    classId: student.classId,
    className: student.className,
    level: student.level,
    transferredAt: new Date(),
  });
  student.classId = classId;
  student.className = className;
  student.level = level;
  await student.save();
  success(res, student, 'Chuyển lớp thành công');
};

// GET /admin/students/:id/payments
exports.getPayments = async (req, res, next) => {
  const student = await Student.findById(req.params.id).select('_id');
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  const payments = await Payment.find({ studentId: req.params.id }).sort({ paidAt: -1 });
  success(res, payments);
};

// POST /admin/students/:id/payments
exports.addPayment = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));

  const { amount, paidAt, note } = req.body;
  if (!amount || Number(amount) <= 0) return next(new AppError('Số tiền không hợp lệ', 400));

  const payment = await Payment.create({
    studentId:      student._id,
    studentName:    student.name,
    classId:        student.classId,
    className:      student.className,
    courseCategory: getCourseCategory(student.level),
    amount:         Number(amount),
    paidAt:         paidAt ? new Date(paidAt) : new Date(),
    note:           note || '',
  });

  student.amount = (student.amount || 0) + Number(amount);
  if ((student.coursePrice || 0) > 0) {
    if (student.amount >= student.coursePrice) student.tuitionStatus = 'paid';
    else student.tuitionStatus = 'partial';
  } else {
    student.tuitionStatus = 'partial';
  }
  await maybeCreateCommission(student);
  await student.save();

  success(res, { payment, student }, 'Ghi nhận thanh toán thành công');
};
