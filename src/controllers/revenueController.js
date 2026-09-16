const Revenue = require('../models/Revenue');
const Student = require('../models/Student');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const EnrollmentPackage = require('../models/EnrollmentPackage');
const Enrollment = require('../models/Enrollment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { packageFacts, aggregateByMonth, vnDateStr, EMPTY_BREAKDOWN, bucketExpenses } = require('../utils/revenueModel');
const { matchesQuery } = require('../utils/textSearch');
const { groupPaymentsByStudent } = require('../utils/paymentGrouping');

const emptyExpenses = () => ({ salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0, total: 0 });

// Nạp toàn bộ gói + ghi danh + khoản thu MỘT lần và dựng "sự thật tiền" của từng gói.
// Mọi con số ở controller này đều suy từ đây nên các bảng luôn khớp thẻ KPI.
async function loadPackageData() {
  const [packages, enrollments, payments] = await Promise.all([
    EnrollmentPackage.find().select('-legacy -adjustmentHistory').lean(),
    Enrollment.find().select('packageId className courseTitle courseCategory netPrice startDate status').sort({ createdAt: 1 }).lean(),
    Payment.find({ packageId: { $ne: null } }).select('packageId studentId amount paidAt note').lean(),
  ]);
  const byPkg = new Map();
  for (const e of enrollments) {
    const k = String(e.packageId);
    if (!byPkg.has(k)) byPkg.set(k, []);
    byPkg.get(k).push(e);
  }
  for (const p of packages) p.enrollments = byPkg.get(String(p._id)) || [];
  return { packages, payments, facts: packageFacts(packages, payments) };
}

// Khoá chưa xếp lớp hiện tên khoá học.
const classNamesOf = pkg => pkg.enrollments.map(e => e.className || e.courseTitle).filter(Boolean);
const categoryOfPackage = pkg => (pkg.enrollments.length === 1 ? pkg.enrollments[0].courseCategory : 'bundle');
const earliestStart = pkg => pkg.enrollments.map(e => (e.startDate || '').slice(0, 10)).filter(Boolean).sort()[0] || '';

function pageParams(req) {
  return {
    page: Math.max(1, parseInt(req.query.page, 10) || 1),
    limit: Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20)),
  };
}

function inRangeFn(from, to) {
  return d => (!from || d >= from) && (!to || d <= to);
}

async function studentMap(ids, fields) {
  const students = await Student.find({ _id: { $in: ids } }).select(fields).lean();
  return new Map(students.map(s => [String(s._id), s]));
}

// GET /admin/revenue/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Mỗi tháng gom theo NHÓM GÓI CHỐT trong tháng (chốt = khoản đóng đầu tiên của gói):
// revenue = Σ học phí gói ghi nhận trọn, collected = Σ đã nộp (kẹp), debt = Σ còn nợ.
exports.getSummary = async (req, res) => {
  const { from, to } = req.query;
  const [{ packages, facts }, targets, expenses] = await Promise.all([
    loadPackageData(),
    Revenue.find().select('month target').lean(),
    Expense.find().lean(),
  ]);

  // Khoản chi gom theo THÁNG CỦA NGÀY CHI — cùng mốc với bộ lọc và với tab Chi phí.
  const { byMonth: expenseMap, total: totalExpenses } = bucketExpenses(expenses, { from, to });

  const months = aggregateByMonth(packages, facts, { from, to });
  for (const key of Object.keys(expenseMap)) {
    if (!months[key]) months[key] = { revenue: 0, collected: 0, debt: 0, hasEstimated: false, breakdown: EMPTY_BREAKDOWN() };
  }

  const targetMap = {};
  for (const t of targets) {
    const raw = t.month || '';
    if (/^\d{4}-\d{2}$/.test(raw)) targetMap[raw] = t.target || 0;
    else {
      const m = raw.match(/(\d+)\/(\d{4})/);
      if (m) targetMap[`${m[2]}-${m[1].padStart(2, '0')}`] = t.target || 0;
    }
  }

  const totalDebt = [...facts.values()].reduce((s, f) => s + f.debt, 0);
  const rows = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => {
      const [year, mo] = key.split('-');
      const exp = expenseMap[key] || emptyExpenses();
      return {
        _month: key,
        month: `Tháng ${parseInt(mo, 10)}/${year}`,
        shortMonth: `T${parseInt(mo, 10)}`,
        revenue: m.revenue,
        collected: m.collected,
        debt: m.debt,
        target: targetMap[key] || 0,
        hasEstimated: m.hasEstimated,
        breakdown: m.breakdown,
        expenses: exp,
        profit: m.revenue - exp.total,
        profitCash: m.collected - exp.total,
      };
    });
  success(res, { rows, totalDebt, totalExpenses });
};

// GET /admin/revenue/breakdown — tổng toàn thời gian, cùng quy tắc tháng chốt.
exports.getBreakdown = async (req, res) => {
  const [{ packages, facts }, expenses] = await Promise.all([loadPackageData(), Expense.find().lean()]);
  const byMonthRaw = aggregateByMonth(packages, facts, {});

  let totalRevenue = 0, totalCollected = 0;
  const revenueBreakdown = EMPTY_BREAKDOWN();
  const byMonth = {};
  for (const [mk, m] of Object.entries(byMonthRaw)) {
    totalRevenue += m.revenue;
    totalCollected += m.collected;
    for (const [k, v] of Object.entries(m.breakdown)) revenueBreakdown[k] += v;
    byMonth[mk] = { ...m, expenses: emptyExpenses() };
  }
  const totalDebt = [...facts.values()].reduce((s, f) => s + f.debt, 0);

  // Cùng quy tắc với /summary: khoản chi thuộc tháng của NGÀY CHI.
  const expenseBreakdown = { salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0 };
  const { byMonth: expByMonth, total: totalExpenses } = bucketExpenses(expenses, {});
  for (const [mk, bucket] of Object.entries(expByMonth)) {
    for (const cat of Object.keys(expenseBreakdown)) expenseBreakdown[cat] += bucket[cat] || 0;
    if (!byMonth[mk]) byMonth[mk] = { revenue: 0, collected: 0, debt: 0, hasEstimated: false, breakdown: EMPTY_BREAKDOWN(), expenses: emptyExpenses() };
    byMonth[mk].expenses = { ...byMonth[mk].expenses, ...bucket };
  }
  const months = Object.keys(byMonth).sort();
  for (const mk of months) {
    const [yr, mo] = mk.split('-');
    byMonth[mk].month = `Tháng ${parseInt(mo, 10)}/${yr}`;
    byMonth[mk].profit = byMonth[mk].revenue - byMonth[mk].expenses.total;
    byMonth[mk].profitCash = byMonth[mk].collected - byMonth[mk].expenses.total;
  }
  success(res, { totalRevenue, totalCollected, totalExpenses, totalDebt, revenueBreakdown, expenseBreakdown, months, byMonth });
};

// Gói chốt trong kỳ đang xem (dùng chung cho 3 bảng danh sách).
function closedInRange(packages, facts, from, to) {
  const inRange = inRangeFn(from, to);
  return packages.filter(p => {
    const f = facts.get(String(p._id));
    return f && f.close && inRange(f.close.date);
  });
}

// GET /admin/revenue/closed-students — DANH SÁCH DOANH THU: mỗi dòng MỘT GÓI chốt trong
// kỳ. Tổng bảng = thẻ Doanh thu / Đã đóng / Công nợ của cùng kỳ.
exports.getClosedStudentList = async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = pageParams(req);
  const { packages, facts } = await loadPackageData();
  const scoped = closedInRange(packages, facts, from, to);
  const students = await studentMap(scoped.map(p => p.studentId), 'name');
  const rows = scoped.map(p => {
    const f = facts.get(String(p._id));
    const names = classNamesOf(p);
    return {
      _id: String(p._id), studentId: String(p.studentId),
      closeDate: f.close.date, estimated: f.close.estimated, startDate: earliestStart(p),
      studentName: students.get(String(p.studentId))?.name || '',
      className: names.join(' + '), classNames: names, courseCategory: categoryOfPackage(p),
      listTotal: p.listTotal, discount: p.discount,
      contract: p.netTotal, paid: f.paid, remaining: f.debt, tuitionStatus: f.tuitionStatus,
    };
  })
    // ?q= tìm theo tên học sinh (không phân biệt dấu); tổng của bảng tính theo kết quả tìm.
    .filter(r => matchesQuery(r.studentName, req.query.q))
    .sort((a, b) => b.closeDate.localeCompare(a.closeDate));

  success(res, {
    items: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    totalContract: rows.reduce((s, r) => s + r.contract, 0),
    totalPaid: rows.reduce((s, r) => s + r.paid, 0),
    totalRemaining: rows.reduce((s, r) => s + r.remaining, 0),
    estimatedCount: rows.filter(r => r.estimated).length,
    page, limit,
  });
};

// GET /admin/revenue/payments — mỗi lần đóng MỘT dòng, cột lớp liệt kê các khoá của gói.
// Chỉ lấy khoản thu của nhóm gói chốt trong kỳ (kể cả lần đóng rơi sang tháng sau) để
// tổng bảng = thẻ "Đã đóng". Phần chênh giữa đã nộp và Σ khoản thu (sửa tay, dữ liệu cũ)
// thêm thành một dòng "điều chỉnh tay".
exports.getPaymentList = async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = pageParams(req);
  const { packages, payments, facts } = await loadPackageData();
  const scoped = closedInRange(packages, facts, from, to);
  const pkgById = new Map(scoped.map(p => [String(p._id), p]));
  // createdAt = ngày thêm học sinh: dùng làm ngày ước tính cho dòng điều chỉnh tay (dữ liệu
  // cũ và các lần ghi nhận tay đều không có ngày đóng thật).
  const students = await studentMap(scoped.map(p => p.studentId), 'name createdAt');

  const rows = [];
  for (const pay of payments) {
    const pkg = pkgById.get(String(pay.packageId));
    if (!pkg) continue;
    rows.push({
      _id: String(pay._id), kind: 'payment',
      date: vnDateStr(pay.paidAt), closeDate: facts.get(String(pkg._id)).close.date,
      studentId: String(pkg.studentId), studentName: students.get(String(pkg.studentId))?.name || '',
      className: classNamesOf(pkg).join(' + '), courseCategory: categoryOfPackage(pkg),
      amount: pay.amount || 0, note: pay.note || '',
    });
  }
  for (const pkg of scoped) {
    const f = facts.get(String(pkg._id));
    const diff = f.paid - f.paymentsTotal;
    if (!diff) continue;
    const stu = students.get(String(pkg.studentId));
    const addedAt = stu && stu.createdAt ? vnDateStr(stu.createdAt) : null;
    rows.push({
      _id: `adj-${pkg._id}`, kind: 'manual',
      date: addedAt, dateEstimated: !!addedAt, closeDate: f.close.date,
      studentId: String(pkg.studentId), studentName: stu?.name || '',
      className: classNamesOf(pkg).join(' + '), courseCategory: categoryOfPackage(pkg),
      amount: diff, note: '',
    });
  }
  // ?q= tìm theo tên học sinh (không phân biệt dấu); tổng của bảng tính theo kết quả tìm.
  const found = rows.filter(r => matchesQuery(r.studentName, req.query.q));
  // 1 dòng = 1 HỌC SINH (chi tiết từng lần đóng nằm trong items) → phân trang theo học sinh.
  const groups = groupPaymentsByStudent(found);

  success(res, {
    items: groups.slice((page - 1) * limit, page * limit),
    total: groups.length,
    paymentCount: found.length,
    totalAmount: found.reduce((s, r) => s + r.amount, 0),
    manualAmount: found.reduce((s, r) => s + (r.kind === 'manual' ? r.amount : 0), 0),
    page, limit,
  });
};

// GET /admin/revenue/debts — gói chốt trong kỳ còn nợ, nợ nhiều nhất lên đầu.
exports.getDebtList = async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = pageParams(req);
  const { packages, facts } = await loadPackageData();
  const scoped = closedInRange(packages, facts, from, to).filter(p => facts.get(String(p._id)).debt > 0);
  const students = await studentMap(scoped.map(p => p.studentId), 'name phone');
  const rows = scoped.map(p => {
    const f = facts.get(String(p._id));
    const s = students.get(String(p.studentId)) || {};
    const names = classNamesOf(p);
    return {
      _id: String(p._id), studentId: String(p.studentId),
      closeDate: f.close.date, estimated: f.close.estimated, startDate: earliestStart(p),
      studentName: s.name || '', phone: s.phone || '',
      className: names.join(' + '), classNames: names, courseCategory: categoryOfPackage(p),
      contract: p.netTotal, paid: f.paid, remaining: f.debt, tuitionStatus: f.tuitionStatus,
    };
  })
    // ?q= tìm theo tên học sinh (không phân biệt dấu); tổng của bảng tính theo kết quả tìm.
    .filter(r => matchesQuery(r.studentName, req.query.q))
    .sort((a, b) => b.remaining - a.remaining);

  success(res, {
    items: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    totalContract: rows.reduce((s, r) => s + r.contract, 0),
    totalPaid: rows.reduce((s, r) => s + r.paid, 0),
    totalRemaining: rows.reduce((s, r) => s + r.remaining, 0),
    page, limit,
  });
};

// Dùng cho dashboard: số liệu tháng hiện tại theo cùng quy tắc.
exports.loadPackageData = loadPackageData;

// GET /admin/revenue — manual target records (legacy)
exports.getAll = async (req, res) => {
  const revenues = await Revenue.find().sort({ month: 1 });
  success(res, revenues);
};

exports.upsert = async (req, res) => {
  const { month } = req.body;
  const revenue = await Revenue.findOneAndUpdate(
    { month },
    req.body,
    { new: true, upsert: true, runValidators: true },
  );
  success(res, revenue, 'Lưu doanh thu thành công');
};

exports.remove = async (req, res, next) => {
  const rev = await Revenue.findByIdAndDelete(req.params.id);
  if (!rev) return next(new AppError('Không tìm thấy bản ghi doanh thu', 404));
  success(res, null, 'Xóa thành công');
};
