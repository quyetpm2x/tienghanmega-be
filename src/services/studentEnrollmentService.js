const mongoose = require('mongoose');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Course = require('../models/Course');
const EnrollmentPackage = require('../models/EnrollmentPackage');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const ReferralCommission = require('../models/ReferralCommission');
const AppError = require('../utils/AppError');
const { generateUniqueReferralCode, resolveReferrer } = require('../utils/referral');
const {
  priceItems, paymentState, deriveStudentStatus, normalizeEnrollmentStatus, commissionOf, PackageMathError,
} = require('../utils/packageMath');
const { categoryOf } = require('../utils/courseCategory');
const { phaseAt } = require('../utils/classPhase');
const { ENROLLMENT_STATUSES } = require('../models/Enrollment');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROFILE_FIELDS = ['name', 'phone', 'email', 'note'];
const money = n => (n || 0).toLocaleString('vi-VN');

// Mọi thao tác chạm nhiều collection chạy trong MỘT transaction: lỗi giữa chừng không
// để lại học sinh không gói, gói không khoá, khoản thu lẻ hay hoa hồng mồ côi (trước
// đây create tạo hoa hồng TRƯỚC khi lưu học sinh, không transaction).
async function inTransaction(fn) {
  try {
    return await mongoose.connection.transaction(fn);
  } catch (err) {
    if (err instanceof PackageMathError) throw new AppError(err.message, 400);
    throw err;
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// Gán người giới thiệu từ mã (nếu body có trường referredByCode). Chuỗi rỗng = gỡ.
async function applyReferredByCode(student, body) {
  if (!body || !('referredByCode' in body)) return;
  const raw = (body.referredByCode || '').trim();
  if (!raw) {
    student.referredByCode = '';
    student.referrerModel = null;
    student.referrerId = undefined;
    return;
  }
  const referrer = await resolveReferrer(raw);
  if (!referrer) throw new AppError('Mã giới thiệu không tồn tại', 400);
  if (referrer.model === 'Student' && String(referrer.id) === String(student._id)) {
    throw new AppError('Không thể tự nhập mã giới thiệu của chính mình', 400);
  }
  student.referredByCode = raw.toUpperCase();
  student.referrerModel = referrer.model;
  student.referrerId = referrer.id;
}

async function sumPayments(packageId, session) {
  const [row] = await Payment.aggregate([
    { $match: { packageId: new mongoose.Types.ObjectId(String(packageId)) } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session);
  return row ? row.total : 0;
}

// Chuẩn hoá danh sách khoá từ body. Mỗi khoá phải có KHOÁ HỌC (courseId) hoặc LỚP (classId);
// lớp không bắt buộc — học sinh đăng ký trước, khoá học sau xếp lớp sau. Tên lớp/khoá đọc
// từ database (không tin client). Chặn trùng lớp trong gói và với lớp đang học ở gói khác.
async function resolveItems(studentId, packageId, rawItems, session) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError('Gói phải có ít nhất một khoá', 400);
  }
  const pickIds = key => rawItems.map(i => i && i[key]).filter(Boolean);
  const [classes, courses, existing] = await Promise.all([
    Class.find({ _id: { $in: pickIds('classId') } }).select('name course phases startDate endDate days time').session(session),
    Course.find({ _id: { $in: pickIds('courseId') } }).select('title').session(session),
    packageId
      ? Enrollment.find({ _id: { $in: pickIds('_id') }, packageId }).session(session)
      : Promise.resolve([]),
  ]);
  const classById = new Map(classes.map(c => [String(c._id), c]));
  const courseById = new Map(courses.map(c => [String(c._id), c]));
  const existingById = new Map(existing.map(e => [String(e._id), e]));
  // Lớp chọn mà không kèm khoá học → tìm khoá học theo tên (Class.course = Course.title.vi).
  const titles = classes.flatMap(c => [c.course, ...(c.phases || []).map(p => p.courseTitle)]).filter(Boolean);
  const coursesByTitle = new Map((titles.length
    ? await Course.find({ 'title.vi': { $in: titles } }).select('title').session(session)
    : []).map(c => [c.title && c.title.vi, c]));
  const seen = new Set();

  const items = [];
  for (let idx = 0; idx < rawItems.length; idx++) {
    const it = rawItems[idx] || {};
    const label = `Khoá thứ ${idx + 1}`;
    const cls = it.classId ? classById.get(String(it.classId)) : null;
    if (it.classId && !cls) throw new AppError(`${label}: không tìm thấy lớp`, 400);
    // Lớp chạy nhiều khoá nối tiếp: khoá của ghi danh là khoá của GIAI ĐOẠN chứa ngày bắt
    // đầu học, không phải khoá đang chạy của lớp (xem utils/classPhase.js).
    const clsCourseTitle = cls ? (phaseAt(cls, it.startDate || cls.startDate || '')?.courseTitle || cls.course || '') : '';
    const course = it.courseId ? courseById.get(String(it.courseId)) : (cls ? coursesByTitle.get(clsCourseTitle) : null);
    if (it.courseId && !course) throw new AppError(`${label}: không tìm thấy khoá học`, 400);
    const prev = it._id ? existingById.get(String(it._id)) : null;
    if (!cls && !course && !(prev && prev.courseTitle)) throw new AppError(`${label} chưa chọn khoá học`, 400);
    if (cls) {
      if (seen.has(String(cls._id))) throw new AppError(`Lớp "${cls.name}" bị chọn trùng trong gói`, 400);
      seen.add(String(cls._id));
    }
    if (it.startDate && !DATE_RE.test(it.startDate)) throw new AppError(`${label}: ngày bắt đầu không hợp lệ`, 400);
    // Đã xếp lớp thì phải có ngày bắt đầu; chưa xếp lớp thì ngày bắt đầu là dự kiến, được trống.
    if (cls && !it.startDate) throw new AppError(`${label} thiếu ngày bắt đầu`, 400);
    if (it.status !== undefined && !ENROLLMENT_STATUSES.includes(it.status)) {
      throw new AppError(`${label}: trạng thái không hợp lệ`, 400);
    }
    if (cls) {
      const dup = await Enrollment.exists({
        studentId, classId: cls._id, status: 'active',
        ...(packageId ? { packageId: { $ne: packageId } } : {}),
      }).session(session);
      if (dup) throw new AppError(`Học sinh đang học lớp "${cls.name}" ở một gói khác`, 400);
    }

    const courseTitle = course ? ((course.title && course.title.vi) || '') : cls ? (clsCourseTitle || '') : prev.courseTitle;
    items.push({
      _id: it._id,
      courseId: course ? course._id : (prev ? prev.courseId : null),
      classId: cls ? cls._id : null,
      className: cls ? cls.name : '',
      courseTitle,
      courseCategory: categoryOf(courseTitle),
      listPrice: Number(it.listPrice),
      discountShare: it.discountShare === undefined ? undefined : Number(it.discountShare),
      startDate: it.startDate || '',
      // Có lớp ↔ đang học, chưa lớp ↔ chưa xếp lớp (tự đổi khi thêm/bỏ lớp trong form gói).
      status: normalizeEnrollmentStatus(it.status !== undefined ? it.status : (prev ? prev.status : undefined), !!cls),
    });
  }
  return items;
}

// Trạng thái học sinh LUÔN do hệ thống tính từ các khoá (không cho đặt tay).
async function recomputeStudentStatus(student, session) {
  student.statusManual = false;
  const statuses = await Enrollment.distinct('status', { studentId: student._id }).session(session);
  const derived = deriveStudentStatus(statuses);
  if (derived) student.status = derived;
}

// Hoa hồng giới thiệu: MỖI HỌC SINH MỘT LẦN, 10% GIÁ NIÊM YẾT của gói đầu tiên đạt điều
// kiện (đã đóng đủ + còn ít nhất một khoá đang học). Chạy trong cùng transaction với
// thao tác kích hoạt nên không tạo hoa hồng khi thao tác đó thất bại.
async function maybeCreateCommission(student, session) {
  if (!student.referrerModel || !student.referrerId || student.commissionCredited) return;
  const packages = await EnrollmentPackage.find({ studentId: student._id })
    .sort({ createdAt: 1 }).session(session).lean();
  for (const pkg of packages) {
    if (!(pkg.listTotal > 0)) continue;
    const hasActive = await Enrollment.exists({ packageId: pkg._id, status: 'active' }).session(session);
    if (!hasActive) continue;
    const paymentsTotal = await sumPayments(pkg._id, session);
    const { tuitionStatus } = paymentState({ netTotal: pkg.netTotal, paymentsTotal, paidAdjustment: pkg.paidAdjustment });
    if (tuitionStatus !== 'paid') continue;
    const c = commissionOf(pkg.listTotal);
    await ReferralCommission.create([{
      referrerModel: student.referrerModel,
      referrerId: student.referrerId,
      referredStudentId: student._id,
      basePrice: c.basePrice,
      rate: c.rate,
      amount: c.amount,
    }], { session });
    student.commissionCredited = true;
    await student.save({ session });
    return;
  }
}

async function recordPayment(student, pkg, enrollments, { amount, paidAt, note }, session) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value <= 0) throw new AppError('Số tiền không hợp lệ', 400);
  const paidDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(paidDate.getTime())) throw new AppError('Ngày đóng không hợp lệ', 400);
  const paymentsTotal = await sumPayments(pkg._id, session);
  const { debt } = paymentState({ netTotal: pkg.netTotal, paymentsTotal, paidAdjustment: pkg.paidAdjustment });
  // Không có chuyện đóng dư — báo lỗi rõ thay vì cắt im lặng.
  if (value > debt) throw new AppError(`Số tiền vượt quá học phí còn lại của gói (${money(debt)}đ)`, 400);
  const [payment] = await Payment.create([{
    studentId: student._id,
    packageId: pkg._id,
    studentName: student.name,
    // Ảnh chụp để hiển thị; báo cáo mới suy lớp từ ghi danh của gói.
    className: enrollments.map(e => e.className || e.courseTitle).filter(Boolean).join(' + '),
    courseCategory: enrollments.length === 1 ? enrollments[0].courseCategory : 'bundle',
    amount: value,
    paidAt: paidDate,
    note: note || '',
  }], { session });
  return payment;
}

async function createPackageForStudent(student, pkgBody, initialPayment, session) {
  if (!pkgBody) throw new AppError('Thiếu thông tin gói đăng ký', 400);
  const items = await resolveItems(student._id, null, pkgBody.enrollments, session);
  const priced = priceItems({
    discount: Number(pkgBody.discount || 0),
    discountAllocation: pkgBody.discountAllocation || 'auto',
    items,
  });
  const [pkg] = await EnrollmentPackage.create([{
    studentId: student._id,
    listTotal: priced.listTotal,
    discount: priced.discount,
    netTotal: priced.netTotal,
    discountAllocation: priced.discountAllocation,
    note: pkgBody.note || '',
  }], { session });
  const enrollments = await Enrollment.create(items.map((it, i) => ({
    studentId: student._id,
    packageId: pkg._id,
    courseId: it.courseId,
    classId: it.classId,
    className: it.className,
    courseTitle: it.courseTitle,
    courseCategory: it.courseCategory,
    listPrice: priced.items[i].listPrice,
    discountShare: priced.items[i].discountShare,
    netPrice: priced.items[i].netPrice,
    startDate: it.startDate,
    status: it.status,
  })), { session, ordered: true });
  if (initialPayment && Number(initialPayment.amount) > 0) {
    await recordPayment(student, pkg, enrollments, initialPayment, session);
  }
  return pkg;
}

async function loadStudent(id, session) {
  const student = await Student.findById(id).session(session);
  if (!student) throw new AppError('Không tìm thấy học viên', 404);
  return student;
}

async function loadPackage(studentId, packageId, session) {
  const pkg = await EnrollmentPackage.findOne({ _id: packageId, studentId }).session(session);
  if (!pkg) throw new AppError('Không tìm thấy gói đăng ký', 404);
  return pkg;
}

exports.createStudent = ({ body }) => inTransaction(async session => {
  const profileBody = (body && body.student) || {};
  const profile = pick(profileBody, PROFILE_FIELDS);
  if (!profile.name || !String(profile.name).trim()) throw new AppError('Vui lòng nhập họ tên', 400);
  const student = new Student(profile);
  student.referralCode = await generateUniqueReferralCode();
  await applyReferredByCode(student, profileBody);
  await student.save({ session });
  await createPackageForStudent(student, body.package, body.initialPayment, session);
  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
  return student._id;
});

exports.updateStudent = ({ id, body }) => inTransaction(async session => {
  const student = await loadStudent(id, session);
  Object.assign(student, pick(body, PROFILE_FIELDS));
  await applyReferredByCode(student, body);
  // Không nhận status/statusManual từ client — tính lại từ các khoá (đồng thời sửa luôn học
  // sinh từng bị đặt tay trước đây).
  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
  return student._id;
});

exports.deleteStudent = ({ id }) => inTransaction(async session => {
  await loadStudent(id, session);
  const hasMoney = await Payment.exists({ studentId: id }).session(session)
    || await EnrollmentPackage.exists({ studentId: id, paidAdjustment: { $ne: 0 } }).session(session);
  // Xoá học sinh đã có tiền sẽ làm doanh thu tụt âm thầm và để lại khoản thu mồ côi.
  if (hasMoney) {
    throw new AppError('Học sinh đã có khoản thu nên không xoá được (để giữ lịch sử doanh thu). Hãy chuyển các khoá sang trạng thái nghỉ.', 400);
  }
  await Enrollment.deleteMany({ studentId: id }).session(session);
  await EnrollmentPackage.deleteMany({ studentId: id }).session(session);
  await Student.deleteOne({ _id: id }).session(session);
});

// Gói đó có đủ điều kiện sinh hoa hồng giới thiệu không (đã đóng đủ + còn khoá đang học)?
async function packageEarnsCommission(pkg, session) {
  if (!(pkg.listTotal > 0)) return false;
  if (!(await Enrollment.exists({ packageId: pkg._id, status: 'active' }).session(session))) return false;
  const paymentsTotal = await sumPayments(pkg._id, session);
  return paymentState({ netTotal: pkg.netTotal, paymentsTotal, paidAdjustment: pkg.paidAdjustment }).tuitionStatus === 'paid';
}

// XOÁ HẲN một gói đăng ký: gói, các khoá trong gói và mọi khoản thu của gói.
// Hoa hồng giới thiệu của học sinh cũng bị xoá, TRỪ khi còn gói khác vẫn đủ điều kiện — khi
// đó giữ nguyên bản ghi cũ để không mất trạng thái "đã trả hoa hồng".
// Doanh thu, công nợ và sĩ số lớp sẽ giảm theo. Không khôi phục được.
exports.deletePackage = ({ studentId, packageId }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const pkg = await loadPackage(studentId, packageId, session);

  const removed = {
    payments: (await Payment.deleteMany({ packageId: pkg._id }).session(session)).deletedCount,
    enrollments: (await Enrollment.deleteMany({ packageId: pkg._id }).session(session)).deletedCount,
  };
  await EnrollmentPackage.deleteOne({ _id: pkg._id }).session(session);

  // Còn gói nào đủ điều kiện thì hoa hồng vẫn có cơ sở — giữ nguyên.
  const rest = await EnrollmentPackage.find({ studentId: student._id }).session(session).lean();
  let stillEarns = false;
  for (const p of rest) {
    if (await packageEarnsCommission(p, session)) { stillEarns = true; break; }
  }
  if (!stillEarns) {
    removed.commissions = (await ReferralCommission.deleteMany({ referredStudentId: student._id }).session(session)).deletedCount;
    student.commissionCredited = false;
  }

  await recomputeStudentStatus(student, session);
  await student.save({ session });
  return removed;
});

exports.addPackage = ({ studentId, body }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const pkg = await createPackageForStudent(student, body && body.package, body && body.initialPayment, session);
  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
  return pkg._id;
});

exports.updatePackage = ({ studentId, packageId, body }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const pkg = await loadPackage(studentId, packageId, session);
  const current = await Enrollment.find({ packageId: pkg._id }).session(session);
  const currentById = new Map(current.map(e => [String(e._id), e]));

  const items = await resolveItems(student._id, pkg._id, body && body.enrollments, session);
  for (const it of items) {
    if (it._id && !currentById.has(String(it._id))) throw new AppError('Có khoá không thuộc gói này', 400);
  }
  const priced = priceItems({
    discount: Number((body && body.discount) || 0),
    discountAllocation: (body && body.discountAllocation) || 'auto',
    items,
  });

  const paymentsTotal = await sumPayments(pkg._id, session);
  const paidRaw = paymentsTotal + (pkg.paidAdjustment || 0);
  if (paidRaw > priced.netTotal) {
    throw new AppError(`Học phí gói sau khi sửa (${money(priced.netTotal)}đ) nhỏ hơn số đã nộp (${money(paidRaw)}đ)`, 400);
  }

  const keep = new Set(items.filter(i => i._id).map(i => String(i._id)));
  const removed = current.filter(e => !keep.has(String(e._id)));
  if (removed.length) await Enrollment.deleteMany({ _id: { $in: removed.map(e => e._id) } }).session(session);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const fields = {
      courseId: it.courseId,
      classId: it.classId,
      className: it.className,
      courseTitle: it.courseTitle,
      courseCategory: it.courseCategory,
      listPrice: priced.items[i].listPrice,
      discountShare: priced.items[i].discountShare,
      netPrice: priced.items[i].netPrice,
      startDate: it.startDate,
      status: it.status,
    };
    if (it._id) {
      // Đổi lớp NGAY TRONG form gói là sửa sai lúc nhập, không phải chuyển lớp — không
      // ghi lịch sử chuyển. Chuyển lớp thật dùng transferEnrollment.
      const e = currentById.get(String(it._id));
      Object.assign(e, fields);
      await e.save({ session });
    } else {
      await Enrollment.create([{ studentId: student._id, packageId: pkg._id, ...fields }], { session });
    }
  }

  pkg.listTotal = priced.listTotal;
  pkg.discount = priced.discount;
  pkg.netTotal = priced.netTotal;
  pkg.discountAllocation = priced.discountAllocation;
  if (body && body.note !== undefined) pkg.note = body.note;
  await pkg.save({ session });

  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
  return pkg._id;
});

exports.setPackagePaid = ({ studentId, packageId, body, admin }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const pkg = await loadPackage(studentId, packageId, session);
  // Chỉ nhận số tiền NỘP THÊM (dương); tổng đã nộp mới = đã nộp hiện tại + số nộp thêm,
  // tối đa bằng học phí gói (không có chuyện đóng dư).
  const addAmount = Number(body && body.addAmount);
  if (!Number.isInteger(addAmount) || addAmount <= 0) throw new AppError('Số tiền nộp thêm phải lớn hơn 0', 400);
  const paymentsTotal = await sumPayments(pkg._id, session);
  const before = paymentState({ netTotal: pkg.netTotal, paymentsTotal, paidAdjustment: pkg.paidAdjustment }).paid;
  const debt = pkg.netTotal - before;
  if (addAmount > debt) {
    throw new AppError(`Số tiền nộp thêm không được vượt quá số còn nợ của gói (${money(debt)}đ)`, 400);
  }
  const target = before + addAmount;
  // Sửa tay "đã nộp" không sinh Payment: phần chênh nằm ở paidAdjustment, rơi đúng vào
  // tháng chốt của gói. Ghi vết để truy được ai đổi, từ bao nhiêu sang bao nhiêu.
  pkg.paidAdjustment = target - paymentsTotal;
  pkg.adjustmentHistory.push({
    from: before,
    to: target,
    changedBy: (admin && (admin.name || admin.username)) || '',
    note: (body && body.note) || '',
  });
  await pkg.save({ session });
  await maybeCreateCommission(student, session);
});

exports.addPayment = ({ studentId, body }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  if (!body || !body.packageId) throw new AppError('Vui lòng chọn gói đăng ký cần ghi nhận', 400);
  const pkg = await loadPackage(studentId, body.packageId, session);
  const enrollments = await Enrollment.find({ packageId: pkg._id }).session(session).lean();
  const payment = await recordPayment(student, pkg, enrollments, body, session);
  await maybeCreateCommission(student, session);
  return payment;
});

exports.updateEnrollment = ({ studentId, enrollmentId, body }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId }).session(session);
  if (!enrollment) throw new AppError('Không tìm thấy khoá học của học sinh', 404);
  if (body && body.status !== undefined) {
    if (!ENROLLMENT_STATUSES.includes(body.status)) throw new AppError('Trạng thái không hợp lệ', 400);
    if (body.status === 'active' && !enrollment.classId) {
      throw new AppError('Khoá chưa xếp lớp — hãy dùng nút "Xếp lớp" để chọn lớp trước', 400);
    }
    if (body.status === 'unassigned' && enrollment.classId) {
      throw new AppError(`Khoá đang ở lớp "${enrollment.className}" nên không thể chuyển về "Chưa xếp lớp"`, 400);
    }
    if (body.status === 'active' && enrollment.classId) {
      const dup = await Enrollment.exists({
        studentId, classId: enrollment.classId, status: 'active', _id: { $ne: enrollment._id },
      }).session(session);
      if (dup) throw new AppError(`Học sinh đang học lớp "${enrollment.className}" ở một gói khác`, 400);
    }
    enrollment.status = body.status;
  }
  if (body && body.startDate !== undefined) {
    if (!DATE_RE.test(body.startDate)) throw new AppError('Ngày bắt đầu không hợp lệ', 400);
    enrollment.startDate = body.startDate;
  }
  await enrollment.save({ session });
  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
});

// Chuyển lớp: KHÔNG đổi giá ghi danh (giá đã chốt theo gói). Loại khoá đi theo khoá
// học của lớp mới để biểu đồ cơ cấu phản ánh đúng khoá đang học.
exports.transferEnrollment = ({ studentId, enrollmentId, body }) => inTransaction(async session => {
  const student = await loadStudent(studentId, session);
  const enrollment = await Enrollment.findOne({ _id: enrollmentId, studentId }).session(session);
  if (!enrollment) throw new AppError('Không tìm thấy khoá học của học sinh', 404);
  if (!body || !body.toClassId) throw new AppError('Thiếu thông tin lớp mới', 400);
  const cls = await Class.findById(body.toClassId).select('name course phases startDate endDate days time').session(session);
  if (!cls) throw new AppError('Không tìm thấy lớp mới', 404);
  if (enrollment.classId && String(enrollment.classId) === String(cls._id)) {
    throw new AppError('Học sinh đang ở lớp này', 400);
  }
  const dup = await Enrollment.exists({
    studentId, classId: cls._id, status: 'active', _id: { $ne: enrollment._id },
  }).session(session);
  if (dup) throw new AppError(`Học sinh đang học lớp "${cls.name}"`, 400);

  // Khoá chưa xếp lớp thì đây là XẾP LỚP lần đầu — không ghi lịch sử chuyển lớp.
  if (enrollment.classId) {
    enrollment.transferHistory.push({
      classId: enrollment.classId,
      className: enrollment.className,
      courseTitle: enrollment.courseTitle,
      transferredAt: new Date(),
    });
  }
  if (body.startDate !== undefined) {
    if (!DATE_RE.test(body.startDate)) throw new AppError('Ngày bắt đầu không hợp lệ', 400);
    enrollment.startDate = body.startDate;
  }
  if (!enrollment.startDate) throw new AppError('Vui lòng chọn ngày bắt đầu học ở lớp này', 400);
  // Chuyển lớp: khoá lấy theo giai đoạn chứa ngày bắt đầu ở lớp mới.
  const phaseTitle = phaseAt(cls, body.startDate || enrollment.startDate || cls.startDate || '')?.courseTitle || cls.course || '';
  const matchedCourse = await Course.findOne({ 'title.vi': phaseTitle }).select('_id').session(session);
  if (matchedCourse) enrollment.courseId = matchedCourse._id;
  enrollment.classId = cls._id;
  enrollment.className = cls.name;
  // Xếp lớp cho khoá đang chờ → bắt đầu học.
  if (enrollment.status === 'unassigned') enrollment.status = 'active';
  enrollment.courseTitle = phaseTitle;
  enrollment.courseCategory = categoryOf(phaseTitle);
  await enrollment.save({ session });
  // Xếp lớp có thể đổi trạng thái học sinh (chưa xếp lớp → đang học) và làm gói đủ điều
  // kiện hoa hồng (cần ít nhất một khoá đang học).
  await recomputeStudentStatus(student, session);
  await student.save({ session });
  await maybeCreateCommission(student, session);
});
