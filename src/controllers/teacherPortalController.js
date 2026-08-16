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
  DEFAULT_PAY_PERIOD_START_DAY, todayDateStr, payPeriodLabel, payPeriodBounds, currentPayPeriodLabel, buildTeacherLedger,
} = require('../utils/teacherLedger');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

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
async function substituteClassNames(teacherId) {
  return TeacherSession.find({ status: 'substituted', substituteTeacherId: teacherId }).distinct('className');
}

// Ngày dạy thay cụ thể theo từng lớp — dùng để FE chỉ hiện ĐÚNG (các) ngày dạy
// thay trên lịch/chi tiết lớp của giáo viên dạy thay, KHÔNG hiện cả lịch học
// định kỳ cả lớp (họ không phải giáo viên chính, dạy thay chỉ 1-vài buổi lẻ).
async function substituteDatesByClass(teacherId) {
  const rows = await TeacherSession.find({ status: 'substituted', substituteTeacherId: teacherId }).select('className date');
  return rows.reduce((acc, r) => { (acc[r.className] ||= []).push(r.date); return acc; }, {});
}

exports.getMyClasses = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const formalClasses = await Class.find({ teacherId }).select(CLASS_FIELDS).sort({ startDate: -1 }).lean();
  const formalNames = new Set(formalClasses.map(c => c.name));

  const subDates = await substituteDatesByClass(teacherId);
  const subNames = Object.keys(subDates).filter(n => !formalNames.has(n));
  let subClasses = [];
  if (subNames.length) {
    subClasses = await Class.find({ name: { $in: subNames } }).select(CLASS_FIELDS).sort({ startDate: -1 }).lean();
    subClasses = subClasses.map(c => ({ ...c, substituteDates: subDates[c.name] }));
  }
  success(res, [...formalClasses, ...subClasses]);
};

exports.getMyClass = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const formal = await Class.findOne({ _id: req.params.id, teacherId }).select(CLASS_FIELDS).lean();
  if (formal) return success(res, formal);

  const subDates = await substituteDatesByClass(teacherId);
  const cls = await Class.findOne({ _id: req.params.id, name: { $in: Object.keys(subDates) } }).select(CLASS_FIELDS).lean();
  // 404, not 403 — don't confirm the class exists if it isn't theirs.
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, { ...cls, substituteDates: subDates[cls.name] });
};

// Tên các lớp giáo viên đang dạy — dùng làm phạm vi truy cập cho toàn bộ các
// hàm bên dưới liên quan tới học sinh/tài khoản học sinh của giáo viên này.
async function myClassNames(teacherId) {
  const classes = await Class.find({ teacherId }).select('name');
  return classes.map(c => c.name);
}

// Xác nhận 1 học sinh thuộc lớp giáo viên này đang dạy — trả về null nếu
// không thuộc (dùng để chặn giáo viên sửa/xem học sinh của lớp khác).
async function assertOwnStudent(teacherId, studentId) {
  const classNames = await myClassNames(teacherId);
  return Student.findOne({ _id: studentId, className: { $in: classNames } });
}

// Toàn bộ học sinh thuộc các lớp giáo viên đang dạy (dùng cho tab "Quản lý học
// sinh") — giáo viên được xem/sửa thông tin cơ bản + ghi chú (không có
// học phí/số tiền — vẫn giữ riêng cho admin).
exports.getMyStudents = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const classNames = await myClassNames(teacherId);
  const students = await Student.find({ className: { $in: classNames } }).select('name phone email className status note').sort({ name: 1 });
  success(res, students);
};

// Giáo viên chỉ được sửa ghi chú của học sinh lớp mình — KHÔNG được sửa họ
// tên/SĐT/email (đổi hồ sơ) hay học phí/số tiền/chuyển lớp (vẫn là nghiệp vụ
// riêng của admin). Body có gửi kèm name/phone/email cũng bị bỏ qua, không lưu.
exports.updateMyStudent = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const student = await assertOwnStudent(teacherId, req.params.id);
  if (!student) return next(new AppError('Không tìm thấy học sinh', 404));

  const { note } = req.body;
  const body = {};
  if (note !== undefined) body.note = note;

  const updated = await Student.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
    .select('name phone email className status note');
  success(res, updated, 'Cập nhật thành công');
};

// ── Tài khoản đăng nhập của học sinh — giáo viên được xem/tạo/reset mật khẩu/
// khoá, scoped theo đúng học sinh thuộc lớp mình dạy. Không có hàm xoá (giống
// admin) — chỉ khoá (isActive=false), giữ nguyên lịch sử điểm/học phí.
exports.getMyStudentAccounts = async (req, res) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const classNames = await myClassNames(teacherId);
  const students = await Student.find({ className: { $in: classNames } }).select('_id');
  const studentIds = students.map(s => s._id);

  const accounts = await Account.find({ studentId: { $in: studentIds }, role: 'student' })
    .select('-password +passwordPlainEnc').populate('studentId', 'name className');
  const result = accounts.map(a => {
    const obj = a.toObject();
    obj.passwordPlain = a.getPlainPassword();
    delete obj.passwordPlainEnc;
    return obj;
  });
  success(res, result);
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
  const safe = await Account.findById(account._id).select('-password +passwordPlainEnc').populate('studentId', 'name className');
  const obj = safe.toObject();
  obj.passwordPlain = safe.getPlainPassword();
  delete obj.passwordPlainEnc;
  success(res, obj, 'Tạo tài khoản thành công', 201);
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
    .select('-password +passwordPlainEnc').populate('studentId', 'name className');
  const obj = updated.toObject();
  obj.passwordPlain = updated.getPlainPassword();
  delete obj.passwordPlainEnc;
  success(res, obj, 'Cập nhật thành công');
};

// Roster for taking attendance — name only, never the admin-facing fields
// (phone/tuition/note/amount) which a teacher has no need to see. Kèm tài
// khoản đăng nhập (nếu học sinh đã được cấp) — mật khẩu chỉ trả về khi học
// sinh CHƯA tự đổi (mustChangePassword=true), để giáo viên đọc cho học sinh
// trong buổi đầu; sau khi học sinh tự đổi, giáo viên không còn xem được nữa.
exports.getClassStudents = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const subNames = await substituteClassNames(teacherId);
  const cls = await Class.findOne({ _id: req.params.id, $or: [{ teacherId }, { name: { $in: subNames } }] }).select('name');
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const students = await Student.find({ className: cls.name, status: 'active' }).select('name').sort({ name: 1 });

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
  const filter = { teacherId };
  if (req.query.classId) {
    const subNames = await substituteClassNames(teacherId);
    const cls = await Class.findOne({ _id: req.query.classId, $or: [{ teacherId }, { name: { $in: subNames } }] }).select('name');
    if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
    filter.className = cls.name;
  }
  const sessions = await StudentAttendance.find(filter).sort({ date: -1 });
  success(res, sessions);
};

exports.createAttendance = async (req, res, next) => {
  const teacherId = req.teacherAccount.teacherId._id;
  const { className, date, sessionNum, note, records } = req.body;

  const subNames = await substituteClassNames(teacherId);
  const cls = await Class.findOne({ name: className, $or: [{ teacherId }, { name: { $in: subNames } }] });
  if (!cls) return next(new AppError('Lớp học không thuộc quyền quản lý của bạn', 403));

  let finalRecords = records;
  if (!finalRecords || finalRecords.length === 0) {
    const students = await Student.find({ className, status: 'active' });
    finalRecords = students.map(s => ({ studentId: s._id, studentName: s.name, status: 'present', note: '' }));
  }

  const session = await StudentAttendance.create({ className, teacherId, date, sessionNum: sessionNum || 1, note: note || '', records: finalRecords });
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
  if (records !== undefined) body.records = records;

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
  const classNames = classes.map(c => c.name);
  const subClassNames = await TeacherSession.find({ status: 'substituted', substituteTeacherId: teacherId }).distinct('className');
  const missingClassNames = subClassNames.filter(n => !classNames.includes(n));
  if (missingClassNames.length) {
    const extraClasses = await Class.find({ name: { $in: missingClassNames } }).select(classSelect).lean();
    classes = classes.concat(extraClasses);
  }
  const allClassNames = classes.map(c => c.name);

  const [overrides, bonuses, commissions, payments] = await Promise.all([
    TeacherSession.find({ className: { $in: allClassNames } }).select('className date status teacherName substituteTeacherId substituteRate').lean(),
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
