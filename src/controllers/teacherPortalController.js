const Class = require('../models/Class');
const Student = require('../models/Student');
const StudentAttendance = require('../models/StudentAttendance');
const Account = require('../models/Account');
const Teacher = require('../models/Teacher');
const TeacherSession = require('../models/TeacherSession');
const TeacherBonus = require('../models/TeacherBonus');
const TeacherPayment = require('../models/TeacherPayment');
const ReferralCommission = require('../models/ReferralCommission');
const PayrollSettings = require('../models/PayrollSettings');
const { generateUniqueReferralCode, buildMyReferrals } = require('../utils/referral');
const {
  DEFAULT_PAY_PERIOD_START_DAY, todayDateStr, payPeriodLabel, payPeriodBounds, currentPayPeriodLabel, buildTeacherLedger, latestPerClassDate,
} = require('../utils/teacherLedger');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const Enrollment = require('../models/Enrollment');
const {
  activeStudentIdsOfClass, activeStudentIdsOfClasses, activeClassesByStudent,
} = require('../utils/enrollment');
const { assertRecordsBelong, rosterOf, classOfRecord } = require('./studentAttendanceController');
const { belongsToClass, recordsOfClassesFilter, resolveClass } = require('../utils/classLink');

// Everything in this controller derives its scope from req.teacherAccount
// (set by protectTeacher) — never from client-supplied filters. A teacher can
// only ever see/write rows tied to their own teacherId.

// Whitelist — never leak price/promo/homepage-display config to a teacher.
const CLASS_FIELDS = 'name course days time capacity startDate endDate status color';

// Lớp giáo viên KHÔNG chính thức phụ trách (không có trong teacherAssignments)
// nhưng có dạy thay ít nhất 1 buổi ở đó (qua "Phân công dạy thay", TeacherSession
// status='substituted') — cần cộng thêm vào phạm vi truy cập lịch/lớp/điểm danh
// bên dưới, để giáo viên dạy thay vẫn thấy đúng lịch dạy thay trong portal của họ
// (Lớp của tôi, Lịch, điểm danh) — không chỉ được TÍNH LƯƠNG (xem getMySalary).
// Buổi dạy thay nối với lớp theo classId (bản ghi cũ chưa có classId thì theo tên).
// Trả về lớp + ngày dạy thay cụ thể theo từng lớp (key = classId) — FE chỉ hiện ĐÚNG
// (các) ngày dạy thay, không hiện cả lịch học định kỳ của lớp.
async function substituteInfo(teacherId, select = CLASS_FIELDS) {
  const subRows = await TeacherSession.find({ status: 'substituted', substituteTeacherId: teacherId })
    .select('classId className date updatedAt createdAt').lean();
  if (!subRows.length) return { classes: [], ids: [], datesByClassId: {} };
  const candidates = await Class.find({
    $or: [
      { _id: { $in: subRows.filter(r => r.classId).map(r => r.classId) } },
      { name: { $in: subRows.filter(r => !r.classId).map(r => r.className) } },
    ],
  }).select(`${select} name`).lean();
  // Chỉ tính buổi dạy thay còn hiệu lực: bản ghi mới nhất của (lớp, ngày) vẫn là dạy thay cho
  // giáo viên này (bản cũ đã bị admin sửa sang trạng thái khác thì bỏ).
  const sameDay = await TeacherSession.find({
    date: { $in: [...new Set(subRows.map(r => r.date))] },
    ...recordsOfClassesFilter(candidates),
  }).select('classId className date status substituteTeacherId updatedAt createdAt').lean();
  const rows = latestPerClassDate(sameDay, candidates)
    .filter(r => r.status === 'substituted' && String(r.substituteTeacherId || '') === String(teacherId));
  const classes = candidates.filter(c => rows.some(r => belongsToClass(r, c)));
  const datesByClassId = {};
  for (const r of rows) {
    const cls = classes.find(c => belongsToClass(r, c));
    if (cls) (datesByClassId[String(cls._id)] ||= []).push(r.date);
  }
  return { classes, ids: classes.map(c => c._id), datesByClassId };
}

// Lớp giáo viên được thao tác: lớp chính thức phụ trách hoặc lớp có dạy thay.
async function findAccessibleClass(teacherId, { classId, className }, select = 'name') {
  const cls = await resolveClass({ classId, className }, `${select} teacherId`);
  if (!cls) return null;
  if (String(cls.teacherId || '') === String(teacherId)) return cls;
  const { ids } = await substituteInfo(teacherId, '_id name');
  return ids.some(id => String(id) === String(cls._id)) ? cls : null;
}

exports.getMyClasses = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const formalClasses = await Class.find({ teacherId }).select(CLASS_FIELDS).sort({ startDate: -1 }).lean();
  const formalIds = new Set(formalClasses.map(c => String(c._id)));

  const sub = await substituteInfo(teacherId);
  const subClasses = sub.classes
    .filter(c => !formalIds.has(String(c._id)))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
    .map(c => ({ ...c, substituteDates: sub.datesByClassId[String(c._id)] }));
  success(res, [...formalClasses, ...subClasses]);
};

exports.getMyClass = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const formal = await Class.findOne({ _id: req.params.id, teacherId }).select(CLASS_FIELDS).lean();
  if (formal) return success(res, formal);

  const sub = await substituteInfo(teacherId);
  const cls = sub.classes.find(c => String(c._id) === String(req.params.id));
  // 404, not 403 — don't confirm the class exists if it isn't theirs.
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, { ...cls, substituteDates: sub.datesByClassId[String(cls._id)] });
};

// Các lớp giáo viên đang dạy — phạm vi truy cập cho toàn bộ hàm liên quan tới học sinh
// và tài khoản học sinh bên dưới.
async function myClasses(teacherId) {
  return Class.find({ teacherId }).select('_id name').lean();
}

// Học sinh thuộc giáo viên khi có ghi danh ĐANG HỌC ở một lớp giáo viên dạy.
async function assertOwnStudent(teacherId, studentId) {
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  const owns = await Enrollment.exists({ studentId, classId: { $in: classIds }, status: 'active' });
  return owns ? Student.findById(studentId) : null;
}

// Gắn tên các lớp (chỉ lớp của giáo viên này) vào từng học sinh. Giữ className dạng
// chuỗi nối để giao diện cũ vẫn đọc được; classNames là mảng đầy đủ.
async function withTeacherClassNames(students, classIds) {
  const map = await activeClassesByStudent(students.map(s => s._id), { classIds });
  return students.map(s => {
    const names = (map.get(String(s._id)) || []).map(c => c.className).filter(Boolean);
    return { ...s, classNames: names, className: names.join(' + ') };
  });
}

// Toàn bộ học sinh thuộc các lớp giáo viên đang dạy (tab "Quản lý học sinh") — không có
// học phí/số tiền, vẫn là dữ liệu riêng của admin.
exports.getMyStudents = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  const ids = await activeStudentIdsOfClasses(classIds);
  const students = await Student.find({ _id: { $in: ids } }).select('name phone email status note').sort({ name: 1 }).lean();
  success(res, await withTeacherClassNames(students, classIds));
};

// Giáo viên chỉ được sửa ghi chú của học sinh lớp mình.
exports.updateMyStudent = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const student = await assertOwnStudent(teacherId, req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));
  const { note } = req.body;
  const body = {};
  if (note !== undefined) body.note = note;
  const updated = await Student.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
    .select('name phone email status note').lean();
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  const [view] = await withTeacherClassNames([updated], classIds);
  success(res, view, 'Cập nhật thành công');
};

// Account populate chỉ lấy tên; tên lớp gắn thêm từ ghi danh.
async function accountView(account, classIds) {
  const obj = account.toObject();
  obj.passwordPlain = account.getPlainPassword();
  delete obj.passwordPlainEnc;
  if (obj.studentId && obj.studentId._id) {
    const [s] = await withTeacherClassNames([obj.studentId], classIds);
    obj.studentId = s;
  }
  return obj;
}

// ── Tài khoản đăng nhập của học sinh — giáo viên được xem/tạo/reset mật khẩu/
// khoá, scoped theo đúng học sinh thuộc lớp mình dạy. Không có hàm xoá (giống
// admin) — chỉ khoá (isActive=false), giữ nguyên lịch sử điểm/học phí.
exports.getMyStudentAccounts = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  const studentIds = await activeStudentIdsOfClasses(classIds);
  const accounts = await Account.find({ studentId: { $in: studentIds }, role: 'student' })
    .select('-password +passwordPlainEnc').populate('studentId', 'name');
  success(res, await Promise.all(accounts.map(a => accountView(a, classIds))));
};

exports.createMyStudentAccount = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { studentId, username, password } = req.body;
  if (!studentId || !username || !password) return next(new AppError('Vui lòng nhập đầy đủ thông tin', 400));
  if (password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const student = await assertOwnStudent(teacherId, studentId);
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));

  const existing = await Account.findOne({ studentId, role: 'student' });
  if (existing) return next(new AppError('Học viên này đã có tài khoản', 400));

  const account = await Account.create({ studentId, username, password, role: 'student' });
  const safe = await Account.findById(account._id).select('-password +passwordPlainEnc').populate('studentId', 'name');
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  success(res, await accountView(safe, classIds), 'Tạo tài khoản thành công', 201);
};

exports.resetMyStudentAccountPassword = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { password } = req.body;
  if (!password || password.length < 6) return next(new AppError('Mật khẩu phải có ít nhất 6 ký tự', 400));

  const account = await Account.findOne({ _id: req.params.id, role: 'student' });
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));
  const student = await assertOwnStudent(teacherId, account.studentId);
  if (!student) return next(new AppError('Không tìm thấy tài khoản', 404));

  account.password = password;
  account.mustChangePassword = true;
  await account.save();
  success(res, null, 'Đặt lại mật khẩu thành công');
};

exports.updateMyStudentAccount = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const account = await Account.findOne({ _id: req.params.id, role: 'student' });
  if (!account) return next(new AppError('Không tìm thấy tài khoản', 404));
  const student = await assertOwnStudent(teacherId, account.studentId);
  if (!student) return next(new AppError('Không tìm thấy tài khoản', 404));

  const { username, isActive } = req.body;
  const body = {};
  if (username !== undefined) body.username = username;
  if (isActive !== undefined) body.isActive = isActive;

  const updated = await Account.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
    .select('-password +passwordPlainEnc').populate('studentId', 'name');
  const classIds = (await myClasses(teacherId)).map(c => c._id);
  success(res, await accountView(updated, classIds), 'Cập nhật thành công');
};

// Roster for taking attendance — name only, never the admin-facing fields
// (phone/tuition/note/amount) which a teacher has no need to see. Kèm tài
// khoản đăng nhập (nếu học sinh đã được cấp) — mật khẩu chỉ trả về khi học
// sinh CHƯA tự đổi (mustChangePassword=true), để giáo viên đọc cho học sinh
// trong buổi đầu; sau khi học sinh tự đổi, giáo viên không còn xem được nữa.
exports.getClassStudents = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const cls = await findAccessibleClass(teacherId, { classId: req.params.id });
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const rosterIds = await activeStudentIdsOfClass(cls._id);
  const students = await Student.find({ _id: { $in: rosterIds } }).select('name').sort({ name: 1 });

  const accounts = await Account.find({ studentId: { $in: students.map(s => s._id) }, role: 'student' })
    .select({ studentId: 1, username: 1, mustChangePassword: 1, passwordPlainEnc: 1 });
  const accountByStudent = new Map(accounts.map(a => [String(a.studentId), a]));

  const result = students.map(s => {
    const acc = accountByStudent.get(String(s._id));
    return {
      _id: s._id,
      name: s.name,
      account: acc ? {
        username: acc.username,
        password: acc.mustChangePassword ? acc.getPlainPassword() : null,
        mustChangePassword: acc.mustChangePassword,
      } : null,
    };
  });
  success(res, result);
};

// Mã giới thiệu của chính giáo viên này + toàn bộ danh sách học sinh đã dùng mã
// này khi đăng ký — kể cả những người CHƯA đóng đủ học phí (chưa phát sinh hoa
// hồng), để giáo viên biết mã của mình đã được dùng chứ không chỉ thấy lúc có tiền.
exports.getMyReferrals = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const teacher = await Teacher.findById(teacherId).select('referralCode');
  if (!teacher) return next(new AppError('Không tìm thấy giảng viên', 404));
  // Giảng viên tạo trước khi có tính năng này có thể chưa có mã — tự sinh
  // ngay khi vào xem trang, không bắt buộc phải chờ admin backfill.
  if (!teacher.referralCode) {
    teacher.referralCode = await generateUniqueReferralCode();
    await teacher.save();
  }
  const referrals = await buildMyReferrals('Teacher', teacherId);
  success(res, { referralCode: teacher.referralCode, referrals });
};

exports.getMyAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  let filter = { teacherId };
  if (req.query.classId) {
    const cls = await findAccessibleClass(teacherId, { classId: req.query.classId });
    if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
    filter = { teacherId, ...recordsOfClassesFilter([cls]) };
  }
  const sessions = await StudentAttendance.find(filter).sort({ date: -1 });
  success(res, sessions);
};

exports.createAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { classId, className, date, sessionNum, note, records } = req.body;

  const cls = await findAccessibleClass(teacherId, { classId, className });
  if (!cls) return next(new AppError('Lớp học không thuộc quyền quản lý của bạn', 403));

  let finalRecords = records;
  if (!finalRecords || finalRecords.length === 0) finalRecords = await rosterOf(cls._id);
  else await assertRecordsBelong(cls._id, finalRecords);

  const session = await StudentAttendance.create({ classId: cls._id, className: cls.name, teacherId, date, sessionNum: sessionNum || 1, note: note || '', records: finalRecords });
  success(res, session, 'Tạo buổi điểm danh thành công', 201);
};

exports.updateAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const existing = await StudentAttendance.findOne({ _id: req.params.id, teacherId });
  if (!existing) return next(new AppError('Không tìm thấy buổi điểm danh', 404));

  // className/teacherId are never editable from this endpoint — only session content.
  const { date, sessionNum, note, records } = req.body;
  const body = {};
  if (date !== undefined) body.date = date;
  if (sessionNum !== undefined) body.sessionNum = sessionNum;
  if (note !== undefined) body.note = note;
  if (records !== undefined) {
    const cls = await classOfRecord(existing);
    if (cls) await assertRecordsBelong(cls._id, records, existing.records);
    body.records = records;
  }

  const session = await StudentAttendance.findByIdAndUpdate(req.params.id, body, { new: true });
  success(res, session, 'Cập nhật thành công');
};

// ── Lương/thưởng của chính giáo viên — tính HOÀN TOÀN ở backend, chỉ trả về số
// tiền cuối cùng theo từng kỳ lương (không trả ratePerSession hay dữ liệu giáo
// viên khác). Dùng chung công thức "kỳ lương" (payPeriodLabel/Bounds) và cách
// gán buổi dạy theo teacherAssignments với trang Lương/Thanh toán của admin —
// xem src/utils/teacherLedger.js — để 2 bên luôn ra cùng 1 con số.
exports.getMySalary = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const todayStr = todayDateStr();
  const settings = await PayrollSettings.findOne();
  const startDay = settings?.startDay || DEFAULT_PAY_PERIOD_START_DAY;

  // Lớp giáo viên đang/đã từng phụ trách — kể cả lớp cũ chưa có teacherAssignments
  // (fallback dùng teacherId hiện tại, xử lý trong buildTeacherLedger).
  const classSelect = 'name teacher teacherId days startDate endDate ratePerSession teacherAssignments';
  let classes = await Class.find({ $or: [{ teacherId }, { 'teacherAssignments.teacherId': teacherId }] })
    .select(classSelect).lean();

  // Lớp giáo viên này KHÔNG hề phụ trách nhưng có dạy thay 1 buổi ở đó (ngoại lệ 1
  // buổi qua "Phân công dạy thay", không đụng teacherAssignments) — vẫn cần lấy về
  // classInfo (đặc biệt ratePerSession) mới tính được tiền cho buổi dạy thay đó.
  const knownIds = new Set(classes.map(c => String(c._id)));
  const sub = await substituteInfo(teacherId, classSelect);
  classes = classes.concat(sub.classes.filter(c => !knownIds.has(String(c._id))));

  const [overrides, bonuses, commissions, payments] = await Promise.all([
    TeacherSession.find(recordsOfClassesFilter(classes)).select('classId className date status teacherName substituteTeacherId substituteRate updatedAt createdAt').lean(),
    TeacherBonus.find({ teacherId }).select('type amount date className note').lean(),
    ReferralCommission.find({ referrerModel: 'Teacher', referrerId: teacherId })
      .populate('referredStudentId', 'name').select('amount createdAt referredStudentId').lean(),
    TeacherPayment.find({ teacherId }).select('periodStart periodEnd amountPaid paidDate note').lean(),
  ]);

  const commissionItems = commissions.map(c => ({
    date: (c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt)).slice(0, 10),
    amount: c.amount, referredStudentName: c.referredStudentId?.name,
  }));

  const ledger = buildTeacherLedger({ teacherId, classes, overrides, bonuses, commissions: commissionItems, todayStr });

  const periodMap = new Map();
  ledger.forEach(item => {
    const label = payPeriodLabel(item.date, startDay);
    if (!periodMap.has(label)) periodMap.set(label, []);
    periodMap.get(label).push(item);
  });
  const currentPeriod = currentPayPeriodLabel(startDay);
  if (!periodMap.has(currentPeriod)) periodMap.set(currentPeriod, []);

  const periods = Array.from(periodMap.entries()).map(([label, items]) => {
    const { start, end } = payPeriodBounds(label, startDay);
    const sessionItems = items.filter(i => i.kind === 'session');
    const bonusItems = items.filter(i => i.kind === 'bonus');
    const penaltyItems = items.filter(i => i.kind === 'penalty');
    const commissionLineItems = items.filter(i => i.kind === 'commission');
    const sessionsByClass = Object.values(sessionItems.reduce((acc, l) => {
      if (!acc[l.className]) acc[l.className] = { className: l.className, count: 0, rate: l.amount, amount: 0, mixedRate: false };
      if (acc[l.className].count > 0 && acc[l.className].rate !== l.amount) acc[l.className].mixedRate = true;
      acc[l.className].count += 1;
      acc[l.className].amount += l.amount;
      return acc;
    }, {}));
    const sessionTotal = sessionItems.reduce((s, l) => s + l.amount, 0);
    const bonusTotal = bonusItems.reduce((s, l) => s + l.amount, 0);
    const penaltyTotal = penaltyItems.reduce((s, l) => s + l.amount, 0); // đã âm sẵn
    const commissionTotal = commissionLineItems.reduce((s, l) => s + l.amount, 0);
    const totalAmount = sessionTotal + bonusTotal + penaltyTotal + commissionTotal;
    const payment = payments.find(p => p.periodStart.slice(0, 7) === label) || null;
    return {
      period: label, periodStart: start, periodEnd: end,
      sessionCount: sessionItems.length, sessionTotal, sessionsByClass,
      // Chi tiết từng buổi (ngày + lớp) — để giáo viên xem "tháng này dạy ngày nào,
      // lớp nào" thay vì chỉ thấy số buổi gộp theo lớp.
      sessionItems: [...sessionItems].sort((a, b) => a.date.localeCompare(b.date)).map(l => ({ date: l.date, className: l.className, amount: l.amount, substituteForTeacherName: l.substituteForTeacherName || null })),
      bonusItems: bonusItems.map(b => ({ date: b.date, amount: b.amount, note: b.note })),
      penaltyItems: penaltyItems.map(b => ({ date: b.date, amount: b.amount, note: b.note })),
      commissionItems: commissionLineItems.map(c => ({ date: c.date, amount: c.amount, note: c.note })),
      totalAmount,
      isPaid: !!payment,
      paidAmount: payment ? payment.amountPaid : null,
      paidDate: payment ? payment.paidDate : null,
    };
  }).sort((a, b) => b.period.localeCompare(a.period));

  const totalAllTime = periods.reduce((s, p) => s + p.totalAmount, 0);

  success(res, { currentPeriod, startDay, totalAllTime, periods });
};
