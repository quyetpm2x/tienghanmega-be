const Revenue = require('../models/Revenue');
const Student = require('../models/Student');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const EnrollmentPackage = require('../models/EnrollmentPackage');
const Enrollment = require('../models/Enrollment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const {
  packageFacts, aggregateByMonth, vnDateStr, EMPTY_BREAKDOWN, bucketExpenses,
  GRAINS, aggregateByBucket, aggregateCashByBucket, eachCashLine, packageCashLines,
  bucketExpensesBy, bucketRangeOf,
} = require('../utils/revenueModel');
const { matchesQuery } = require('../utils/textSearch');
const { groupPaymentsByStudent } = require('../utils/paymentGrouping');

const emptyExpenses = () => ({ salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0, total: 0 });

// Nạp toàn bộ gói + ghi danh + khoản thu MỘT lần và dựng "sự thật tiền" của từng gói.
// Mọi con số ở controller này đều suy từ đây nên các bảng luôn khớp thẻ KPI.
async function loadPackageData() {
  // adjustmentHistory và ngày thêm học sinh là ĐẦU VÀO của ngày chốt (ngày đồng tiền đầu tiên
  // về), không phải thứ trang trí — bỏ chúng đi là ngày chốt tính sai, nên nạp cùng luôn.
  const [packages, enrollments, payments, students] = await Promise.all([
    EnrollmentPackage.find().select('-legacy').lean(),
    Enrollment.find().select('packageId className courseTitle courseCategory netPrice startDate status').sort({ createdAt: 1 }).lean(),
    Payment.find({ packageId: { $ne: null } }).select('packageId studentId amount paidAt note recordedBy').lean(),
    Student.find().select('createdAt').lean(),
  ]);
  const byPkg = new Map();
  for (const e of enrollments) {
    const k = String(e.packageId);
    if (!byPkg.has(k)) byPkg.set(k, []);
    byPkg.get(k).push(e);
  }
  for (const p of packages) p.enrollments = byPkg.get(String(p._id)) || [];

  const studentCreatedAt = new Map(students.map(st => [String(st._id), st.createdAt]));
  const paymentsByPkg = new Map();
  for (const p of payments) {
    const id = String(p.packageId);
    if (!paymentsByPkg.has(id)) paymentsByPkg.set(id, []);
    paymentsByPkg.get(id).push(p);
  }
  return { packages, payments, paymentsByPkg, studentCreatedAt, facts: packageFacts(packages, payments, { studentCreatedAt }) };
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

// GET /admin/revenue/series?grain=day|week|month&from=YYYY-MM-DD&to=YYYY-MM-DD
// Cùng một tầng gom nhóm với /summary, chỉ khác độ phân giải. Trả thêm `cashIn` — tiền mặt
// thực thu, gom theo ngày TIỀN VỀ của từng khoản (xem aggregateCashByBucket). Khác
// `collected` ở chỗ `collected` gán TRỌN vào kỳ chốt: ở grain tháng hai số gần như trùng, ở
// grain ngày thì lệch hẳn và `cashIn` mới là số đúng với két.
// Chỉ trả bucket CÓ dữ liệu; FE tự bơm bucket rỗng cho liền trục (nó đã biết khoảng cần vẽ).
exports.getSeries = async (req, res, next) => {
  const grain = String(req.query.grain || 'month');
  if (!GRAINS.includes(grain)) {
    return next(new AppError(`grain phải là một trong: ${GRAINS.join(', ')}`, 400));
  }
  const from = req.query.from || '';
  const to = req.query.to || '';
  for (const [name, v] of [['from', from], ['to', to]]) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return next(new AppError(`${name} phải có dạng YYYY-MM-DD`, 400));
  }

  const [{ packages, paymentsByPkg, studentCreatedAt, facts }, expenses] = await Promise.all([
    loadPackageData(),
    Expense.find().lean(),
  ]);

  const closed = aggregateByBucket(packages, facts, { from, to, grain });
  const { byBucket: cashByBucket, noRecordByBucket } = aggregateCashByBucket(packages, facts, {
    paymentsByPkg, studentCreatedAt, from, to, grain,
  });
  const { byBucket: expByBucket } = bucketExpensesBy(expenses, { from, to, grain });

  const keys = [...new Set([...Object.keys(closed), ...Object.keys(cashByBucket), ...Object.keys(expByBucket)])].sort();
  const buckets = keys.map(key => {
    const c = closed[key] || { revenue: 0, collected: 0, debt: 0, hasEstimated: false, breakdown: EMPTY_BREAKDOWN() };
    return {
      key,
      ...bucketRangeOf(key, grain),
      revenue: c.revenue,
      collected: c.collected,
      debt: c.debt,
      // Tiền mặt gom theo ngày TIỀN VỀ của từng khoản; `cashNoRecord` là phần trong đó có
      // ngày suy ra (ngày ghi nhận / ngày tạo gói / ngày thêm học sinh) thay vì ngày đóng
      // thật, tách riêng để FE đánh dấu kẻ chéo.
      cashIn: cashByBucket[key] || 0,
      cashNoRecord: noRecordByBucket[key] || 0,
      hasEstimated: c.hasEstimated,
      breakdown: c.breakdown,
      expenses: expByBucket[key] || emptyExpenses(),
    };
  });

  // Cộng thẳng từ buckets, không cộng song song ở chỗ khác — tổng và từng cột luôn khớp nhau.
  const totals = buckets.reduce((acc, b) => ({
    revenue: acc.revenue + b.revenue,
    collected: acc.collected + b.collected,
    debt: acc.debt + b.debt,
    cashIn: acc.cashIn + b.cashIn,
    cashNoRecord: acc.cashNoRecord + b.cashNoRecord,
    expenses: acc.expenses + b.expenses.total,
  }), { revenue: 0, collected: 0, debt: 0, cashIn: 0, cashNoRecord: 0, expenses: 0 });

  success(res, { grain, buckets, totals });
};

// GET /admin/revenue/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
// Hai bảng chi tiết THEO NGÀY của tab Doanh thu, luôn gom theo ngày dù bộ lọc đang ở mức nào:
//   revenue — học viên ĐĂNG KÝ (gói chốt) trong ngày; tổng = cột navy của biểu đồ
//   cash    — tiền THỰC NHẬN trong ngày;             tổng = cột xanh lá
// Hai bảng cố tình dựng từ đúng hai hàm đang vẽ biểu đồ (aggregateByBucket / eachCashLine)
// để bảng và cột không bao giờ cộng ra hai con số khác nhau.
exports.getDaily = async (req, res, next) => {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  // Hai cách chỉ định phạm vi:
  //   from+to  → một khoảng liền mạch (biểu đồ xu hướng bấm vào một kỳ)
  //   dates    → vài NGÀY rời rạc (biểu đồ lũy kế bấm ngày N: lấy ngày N của cả 4 tháng đang
  //              so sánh). Nạp cả khoảng bao ngoài rồi lọc lại, rẻ hơn nhiều so với việc trả
  //              hết dữ liệu 13 tháng chỉ để lấy 4 ngày.
  const picked = String(req.query.dates || '').split(',').map(d => d.trim()).filter(Boolean);
  if (picked.length > 31) return next(new AppError('dates tối đa 31 ngày', 400));
  for (const d of picked) {
    if (!DATE.test(d)) return next(new AppError('dates phải là các ngày YYYY-MM-DD, cách nhau bởi dấu phẩy', 400));
  }
  const dateSet = picked.length ? new Set(picked) : null;
  const sorted = [...picked].sort();
  const from = dateSet ? sorted[0] : (req.query.from || '');
  const to = dateSet ? sorted[sorted.length - 1] : (req.query.to || '');
  if (!dateSet) {
    for (const [name, v] of [['from', from], ['to', to]]) {
      if (!v) return next(new AppError(`Thiếu tham số ${name}`, 400));
      if (!DATE.test(v)) return next(new AppError(`${name} phải có dạng YYYY-MM-DD`, 400));
    }
  }

  const { packages, paymentsByPkg, studentCreatedAt, facts } = await loadPackageData();
  const students = await studentMap(packages.map(p => p.studentId), 'name');
  const nameOf = id => students.get(String(id))?.name || '';

  // ── Bảng 1: học viên đăng ký trong ngày ────────────────────────────────────────────────
  const revByDay = new Map();
  for (const pkg of packages) {
    const f = facts.get(String(pkg._id));
    if (!f || !f.close || f.close.date < from || f.close.date > to) continue;
    if (dateSet && !dateSet.has(f.close.date)) continue;
    if (!revByDay.has(f.close.date)) revByDay.set(f.close.date, []);
    revByDay.get(f.close.date).push({
      studentId: String(pkg.studentId), studentName: nameOf(pkg.studentId),
      className: classNamesOf(pkg).join(' + '), courseCategory: categoryOfPackage(pkg),
      amount: pkg.netTotal || 0, paid: f.paid, debt: f.debt,
      // Ngày này suy từ ngày khai giảng vì gói chưa có khoản thu nào — SỐ TIỀN vẫn đúng.
      dateEstimated: !!f.close.estimated,
    });
  }

  // ── Bảng 2: tiền thực nhận trong ngày ──────────────────────────────────────────────────
  const cashByDay = new Map();
  eachCashLine(packages, facts, { paymentsByPkg, studentCreatedAt, from, to }, (it, pkg, f) => {
    if (dateSet && !dateSet.has(it.date)) return;
    if (!cashByDay.has(it.date)) cashByDay.set(it.date, []);
    cashByDay.get(it.date).push({
      studentId: String(pkg.studentId), studentName: nameOf(pkg.studentId),
      className: classNamesOf(pkg).join(' + '), courseCategory: categoryOfPackage(pkg),
      amount: it.amount, note: it.note || '', recordedBy: it.changedBy || '',
      // Khoản này là một phần của gói nào, gói giá bao nhiêu và còn nợ bao nhiêu — không có
      // thì nhìn "3.000.000đ" trơ trọi không biết nó thuộc hợp đồng nào.
      packageTotal: pkg.netTotal || 0, packagePaid: f.paid, packageDebt: f.debt,
      kind: it.type,
      // 'payment' là ngày đóng thật; hai loại còn lại là ngày suy ra (xem fallbackCashDate).
      dateEstimated: it.type !== 'payment',
    });
  });

  const toRows = (map, extra = () => ({})) => [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const sorted = [...items].sort((x, y) => y.amount - x.amount);
      return {
        date,
        count: sorted.length,
        amount: sorted.reduce((s, i) => s + i.amount, 0),
        estimatedAmount: sorted.reduce((s, i) => s + (i.dateEstimated ? i.amount : 0), 0),
        items: sorted,
        ...extra(sorted),
      };
    });

  const revenue = toRows(revByDay);
  const cash = toRows(cashByDay);
  success(res, {
    from, to, revenue, cash,
    totals: {
      revenue: revenue.reduce((s, r) => s + r.amount, 0),
      cash: cash.reduce((s, r) => s + r.amount, 0),
    },
  });
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

// GET /admin/revenue/payments — mỗi khoản tiền THỰC NHẬN trong kỳ một dòng, cột lớp liệt kê
// các khoá của gói. Gom theo NGÀY TIỀN VỀ nên tổng bảng khớp thẻ "Tiền mặt thực thu" và bảng
// "Tiền đã nhận theo ngày". Khoản không có bản ghi thanh toán (sửa tay, dữ liệu cũ) vẫn có
// mặt, đánh dấu kind='manual' và dateEstimated.
exports.getPaymentList = async (req, res) => {
  const { from, to } = req.query;
  const { page, limit } = pageParams(req);
  const { packages, paymentsByPkg, studentCreatedAt, facts } = await loadPackageData();
  const students = await studentMap(packages.map(p => p.studentId), 'name');

  // Lọc theo NGÀY TIỀN VỀ, không phải "nhóm gói chốt trong kỳ" như bản trước. Cách cũ bỏ sót
  // khoản của học sinh chốt tháng trước mà đóng thêm trong kỳ này, nên bảng lệch hẳn với thẻ
  // KPI "Tiền mặt thực thu" và bảng "Tiền đã nhận theo ngày" ngay bên trên — hai chỗ cùng nói
  // về tiền mà ra hai số thì không dùng được. Dùng chung eachCashLine với chúng.
  const rows = [];
  eachCashLine(packages, facts, { paymentsByPkg, studentCreatedAt, from, to }, (it, pkg, f) => {
    rows.push({
      _id: it._id ? String(it._id) : `adj-${pkg._id}-${it.date}`,
      // Giao diện chỉ phân biệt "có chứng từ" và "nhập tay" nên gộp manual + legacy.
      kind: it.type === 'payment' ? 'payment' : 'manual',
      date: it.date, dateEstimated: it.type !== 'payment',
      closeDate: f.close ? f.close.date : null,
      studentId: String(pkg.studentId), studentName: students.get(String(pkg.studentId))?.name || '',
      className: classNamesOf(pkg).join(' + '), courseCategory: categoryOfPackage(pkg),
      amount: it.amount, note: it.note || '',
    });
  });
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
