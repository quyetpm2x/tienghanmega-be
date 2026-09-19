const Student = require('../models/Student');
const Class = require('../models/Class');
const Payment = require('../models/Payment');
const EnrollmentPackage = require('../models/EnrollmentPackage');
const Enrollment = require('../models/Enrollment');
const svc = require('../services/studentEnrollmentService');
const { paymentState } = require('../utils/packageMath');
const { buildAdminPaymentHistory } = require('../utils/paymentHistory');
const Account = require('../models/Account');
const { attachPackages, activeStudentIdsOfClass } = require('../utils/enrollment');
const { applyDerivedFilters } = require('../utils/studentQuery');
const { filterIndexRows, sortIndexRows, statsOfIndexRows } = require('../utils/studentIndexPipeline');
const { getStudentIndex, invalidateStudentIndex } = require('../utils/studentIndexCache');
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

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ?exact=1 → tìm kiếm phải trùng khớp hoàn toàn (tên/SĐT/email/mã), không phải tìm chứa.
const isExactQuery = q => q && (q.exact === '1' || q.exact === 'true');

// Mã học sinh đã có tài khoản đăng nhập — cho bộ lọc "có / chưa có tài khoản".
async function accountedStudentIds() {
  const accounts = await Account.find({ role: 'student', studentId: { $ne: null } }).select('studentId').lean();
  return new Set(accounts.map(a => String(a.studentId)));
}

// Lọc ở DATABASE trước (tên/SĐT/email/mã giới thiệu, lớp), rồi mới tính gói cho số còn lại —
// tính tiền cho cả bảng học sinh là phần nặng nhất, phải thu hẹp trước khi chạm vào.
async function loadFilteredStudents(query) {
  const { classId, className, q } = query;
  const filter = {};
  let cid = classId;
  if (!cid && className) {
    const cls = await Class.findOne({ name: className }).select('_id').lean();
    if (!cls) return null;
    cid = cls._id;
  }
  if (cid) filter._id = { $in: await activeStudentIdsOfClass(cid) };
  if (q && String(q).trim()) {
    // exact = khớp hoàn toàn cả ô (neo ^...$), mặc định vẫn là tìm chứa.
    const needle = escapeRegex(String(q).trim());
    const rx = new RegExp(isExactQuery(query) ? `^${needle}$` : needle, 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { referralCode: rx }, { referredByCode: rx }];
  }
  const students = await Student.find(filter).select(HIDE_LEGACY).sort({ createdAt: -1 }).lean();
  const rows = await attachPackages(students);
  const needAccounts = query.account === 'has-account' || query.account === 'no-account';
  return applyDerivedFilters(rows, {
    courseTitle: query.courseTitle,
    tuitionStatus: query.tuitionStatus,
    studentStatus: query.studentStatus,
    account: query.account,
    accountedIds: needAccounts ? await accountedStudentIds() : null,
  });
}

// Lớp đang chọn ở bộ lọc → mã lớp (chỉ mục đã mang sẵn danh sách lớp của từng học sinh).
async function classIdOfFilter({ classId, className }) {
  if (classId) return { id: String(classId) };
  if (!className) return {};
  const cls = await Class.findOne({ name: className }).select('_id').lean();
  return cls ? { id: String(cls._id) } : { none: true };
}

// GET /admin/students?classId=&className=&tuitionStatus=&q=&courseTitle=&studentStatus=&account=
//   &page=&limit=&sort=
// Có page/limit → LỌC, SẮP XẾP, CẮT TRANG NGAY TRONG MONGODB (utils/studentIndexPipeline.js),
// rồi chỉ dựng dữ liệu đầy đủ cho đúng số học sinh của trang đó.
// Không có → trả cả mảng như trước (các trang khác vẫn dùng kiểu này).
exports.getAll = async (req, res) => {
  const paged = req.query.page != null || req.query.limit != null;
  if (!paged) {
    const rows = await loadFilteredStudents(req.query);
    return success(res, rows || []);
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 15));
  const emptyPage = { items: [], total: 0, page, limit, stats: statsOfIndexRows([]) };

  const cls = await classIdOfFilter(req.query);
  if (cls.none) return success(res, emptyPage);

  // Chỉ mục lấy từ bộ nhớ đệm (làm mới sau mỗi thao tác ghi) → lọc/tìm/sắp xếp chạy tại chỗ.
  const rows = await getStudentIndex();
  const filtered = filterIndexRows(rows, { ...req.query, exact: isExactQuery(req.query), classId: cls.id });
  const sorted = sortIndexRows(filtered, req.query.sort === 'asc' ? 'asc' : 'desc');
  const ids = sorted.slice((page - 1) * limit, page * limit).map(r => r._id);

  // Dựng dữ liệu đầy đủ CHỈ cho các học sinh của trang này, giữ đúng thứ tự đã sắp.
  const students = await Student.find({ _id: { $in: ids } }).select(HIDE_LEGACY).lean();
  const byId = new Map(students.map(s => [String(s._id), s]));
  const ordered = ids.map(id => byId.get(String(id))).filter(Boolean);

  success(res, {
    items: await attachPackages(ordered),
    total: sorted.length,
    stats: statsOfIndexRows(sorted),
    page, limit,
  });
};

// GET /admin/students/stats — thống kê trên TOÀN BỘ học sinh (thẻ ở đầu trang), không theo
// bộ lọc. Chỉ đọc chỉ mục gọn, không dựng gói cho ai.
exports.getStats = async (req, res) => {
  success(res, statsOfIndexRows(await getStudentIndex()));
};

exports.getOne = async (req, res) => {
  success(res, await viewOf(req.params.id));
};

exports.create = async (req, res) => {
  const id = await svc.createStudent({ body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(id), 'Thêm học viên thành công', 201);
};

exports.update = async (req, res) => {
  await svc.updateStudent({ id: req.params.id, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Cập nhật thành công');
};

exports.remove = async (req, res) => {
  const removed = await svc.deleteStudent({ id: req.params.id, body: req.body });
  invalidateStudentIndex();
  success(res, removed,
    `Đã xoá học sinh: ${removed.packages} gói, ${removed.enrollments} khoá, ${removed.payments} khoản thu`);
};

// POST /admin/students/:id/referral-code — sinh mã cho học sinh CHƯA có (idempotent).
exports.generateReferralCode = async (req, res, next) => {
  const student = await Student.findById(req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));
  if (!student.referralCode) {
    student.referralCode = await generateUniqueReferralCode();
    await student.save();
    invalidateStudentIndex();
  }
  success(res, await viewOf(student._id), 'Đã tạo mã giới thiệu');
};

exports.addPackage = async (req, res) => {
  await svc.addPackage({ studentId: req.params.id, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã thêm gói đăng ký', 201);
};

exports.updatePackage = async (req, res) => {
  await svc.updatePackage({ studentId: req.params.id, packageId: req.params.packageId, body: req.body });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã cập nhật gói đăng ký');
};

// DELETE /admin/students/:id/packages/:packageId — xoá hẳn gói, khoá trong gói và khoản thu.
exports.deletePackage = async (req, res) => {
  const removed = await svc.deletePackage({ studentId: req.params.id, packageId: req.params.packageId });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id),
    `Đã xoá gói đăng ký: ${removed.enrollments} khoá, ${removed.payments} khoản thu` +
    (removed.commissions ? `, ${removed.commissions} hoa hồng` : ''));
};

exports.setPackagePaid = async (req, res) => {
  await svc.setPackagePaid({ studentId: req.params.id, packageId: req.params.packageId, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã cập nhật số tiền đã nộp');
};

exports.updateEnrollment = async (req, res) => {
  await svc.updateEnrollment({ studentId: req.params.id, enrollmentId: req.params.enrollmentId, body: req.body });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã cập nhật khoá học');
};

exports.transferEnrollment = async (req, res) => {
  await svc.transferEnrollment({ studentId: req.params.id, enrollmentId: req.params.enrollmentId, body: req.body });
  invalidateStudentIndex();
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

// GET /admin/students/:id/payment-history?packageId=
// Mỗi lần tiền vào là 1 dòng: khoản thu, lần admin sửa tay ô "đã nộp", và phần đã nộp từ dữ
// liệu cũ không có lịch sử — tổng các dòng luôn bằng số "Đã nộp" đang hiển thị.
exports.getPaymentHistory = async (req, res, next) => {
  // createdAt = ngày thêm học sinh, dùng làm ngày ước tính cho phần đã nộp của dữ liệu cũ.
  const student = await Student.findById(req.params.id).select('createdAt').lean();
  if (!student) return next(new AppError('Không tìm thấy học viên', 404));

  const pkgFilter = { studentId: req.params.id };
  if (req.query.packageId) pkgFilter._id = req.query.packageId;
  const [packages, payments] = await Promise.all([
    EnrollmentPackage.find(pkgFilter).sort({ createdAt: 1 }).lean(),
    Payment.find({ studentId: req.params.id }).lean(),
  ]);
  const enrollments = await Enrollment.find({ packageId: { $in: packages.map(p => p._id) } })
    .select('packageId className courseTitle').lean();

  const items = packages.flatMap((pkg, i) => {
    const ofPkg = payments.filter(p => String(p.packageId) === String(pkg._id));
    const state = paymentState({
      netTotal: pkg.netTotal,
      paymentsTotal: ofPkg.reduce((s, p) => s + (p.amount || 0), 0),
      paidAdjustment: pkg.paidAdjustment,
    });
    const classNames = enrollments
      .filter(e => String(e.packageId) === String(pkg._id))
      .map(e => e.className || e.courseTitle).filter(Boolean);
    return buildAdminPaymentHistory({
      packageId: pkg._id,
      packageLabel: `Gói ${i + 1}`,
      className: [...new Set(classNames)].join(' + '),
      payments: ofPkg,
      adjustmentHistory: pkg.adjustmentHistory || [],
      // Tổng các dòng = số thực đã nộp (không kẹp theo học phí).
      paid: Math.max(state.paidRaw || 0, 0),
      legacyDate: student.createdAt || null,
    });
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  success(res, items);
};

exports.updatePayment = async (req, res) => {
  await svc.updatePayment({ studentId: req.params.id, paymentId: req.params.paymentId, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã cập nhật khoản thu');
};

exports.deletePayment = async (req, res) => {
  await svc.deletePayment({ studentId: req.params.id, paymentId: req.params.paymentId });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã xoá khoản thu');
};

// Gắn ngày đóng cho phần tiền cũ của một gói — tổng đã nộp không đổi.
exports.convertLegacyPaid = async (req, res) => {
  await svc.convertLegacyPaid({ studentId: req.params.id, packageId: req.params.packageId, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, await viewOf(req.params.id), 'Đã gắn ngày đóng cho khoản tiền cũ');
};

exports.addPayment = async (req, res) => {
  const payment = await svc.addPayment({ studentId: req.params.id, body: req.body, admin: req.admin });
  invalidateStudentIndex();
  success(res, { payment, student: await viewOf(req.params.id) }, 'Ghi nhận thanh toán thành công');
};
