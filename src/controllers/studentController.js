const Student = require('../models/Student');
const Class = require('../models/Class');
const Payment = require('../models/Payment');
const svc = require('../services/studentEnrollmentService');
const { attachPackages, activeStudentIdsOfClass } = require('../utils/enrollment');
const { generateUniqueReferralCode } = require('../utils/referral');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Không trả các trường CŨ (một lớp — một học phí) cho client: nếu còn gửi, giao diện
// cũ sẽ tiếp tục đọc nhầm số liệu đã ngừng cập nhật mà không ai phát hiện.
const HIDE_LEGACY = '-classId -className -level -startDate -tuitionStatus -amount -coursePrice -amountHistory -transferHistory';

async function viewOf(id) {
  const student = await Student.findById(id).select(HIDE_LEGACY).lean();
  if (!student) throw new AppError('Không tìm thấy học viên', 404);
  const [view] = await attachPackages([student]);
  return view;
}

// GET /admin/students?classId=&className=&tuitionStatus=
exports.getAll = async (req, res) => {
  const { classId, className, tuitionStatus } = req.query;
  const filter = {};
  let cid = classId;
  if (!cid && className) {
    const cls = await Class.findOne({ name: className }).select('_id').lean();
    if (!cls) return success(res, []);
    cid = cls._id;
  }
  if (cid) filter._id = { $in: await activeStudentIdsOfClass(cid) };
  const students = await Student.find(filter).select(HIDE_LEGACY).sort({ createdAt: -1 }).lean();
  let rows = await attachPackages(students);
  if (tuitionStatus) rows = rows.filter(s => s.summary.tuitionStatus === tuitionStatus);
  success(res, rows);
};

exports.getOne = async (req, res) => {
  success(res, await viewOf(req.params.id));
};

exports.create = async (req, res) => {
  const id = await svc.createStudent({ body: req.body, admin: req.admin });
  success(res, await viewOf(id), 'Thêm học viên thành công', 201);
};

exports.update = async (req, res) => {
  await svc.updateStudent({ id: req.params.id, body: req.body, admin: req.admin });
  success(res, await viewOf(req.params.id), 'Cập nhật thành công');
};

exports.remove = async (req, res) => {
  await svc.deleteStudent({ id: req.params.id });
  success(res, null, 'Xóa thành công');
};

// POST /admin/students/:id/referral-code — sinh mã cho học sinh CHƯA có (idempotent).
exports.generateReferralCode = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  if (!student.referralCode) {
    student.referralCode = await generateUniqueReferralCode();
    await student.save();
  }
  success(res, await viewOf(student._id), 'Đã tạo mã giới thiệu');
};

exports.addPackage = async (req, res) => {
  await svc.addPackage({ studentId: req.params.id, body: req.body, admin: req.admin });
  success(res, await viewOf(req.params.id), 'Đã thêm gói đăng ký', 201);
};

exports.updatePackage = async (req, res) => {
  await svc.updatePackage({ studentId: req.params.id, packageId: req.params.packageId, body: req.body });
  success(res, await viewOf(req.params.id), 'Đã cập nhật gói đăng ký');
};

exports.setPackagePaid = async (req, res) => {
  await svc.setPackagePaid({ studentId: req.params.id, packageId: req.params.packageId, body: req.body, admin: req.admin });
  success(res, await viewOf(req.params.id), 'Đã cập nhật số tiền đã nộp');
};

exports.updateEnrollment = async (req, res) => {
  await svc.updateEnrollment({ studentId: req.params.id, enrollmentId: req.params.enrollmentId, body: req.body });
  success(res, await viewOf(req.params.id), 'Đã cập nhật khoá học');
};

exports.transferEnrollment = async (req, res) => {
  await svc.transferEnrollment({ studentId: req.params.id, enrollmentId: req.params.enrollmentId, body: req.body });
  success(res, await viewOf(req.params.id), 'Chuyển lớp thành công');
};

// GET /admin/students/:id/payments?packageId=
exports.getPayments = async (req, res, next) => {
  const exists = await Student.exists({ _id: req.params.id });
  if (!exists) return next(new AppError('Không tìm thấy học viên', 404));
  const filter = { studentId: req.params.id };
  if (req.query.packageId) filter.packageId = req.query.packageId;
  const payments = await Payment.find(filter).sort({ paidAt: -1 }).lean();
  success(res, payments);
};

exports.addPayment = async (req, res) => {
  const payment = await svc.addPayment({ studentId: req.params.id, body: req.body });
  success(res, { payment, student: await viewOf(req.params.id) }, 'Ghi nhận thanh toán thành công');
};
