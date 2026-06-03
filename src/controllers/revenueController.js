const Revenue = require('../models/Revenue');
const Student  = require('../models/Student');
const Expense  = require('../models/Expense');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

function getCourseCategory(level) {
  if (!level) return 'conversation';
  const l = level.toLowerCase();
  if (l.includes('sơ cấp') || l.includes('so cap')) return 'beginner';
  if (l.includes('trung cấp') || l.includes('trung cap')) return 'intermediate';
  if (l.includes('topik') || l.includes('lộ trình') || l.includes('lo trinh')) return 'topik';
  return 'conversation';
}

// GET /admin/revenue/summary — computed from Student collection
// Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (exact date filtering)
exports.getSummary = async (req, res, next) => {
  try {
  const { from, to } = req.query;

  // Exact date comparison (YYYY-MM-DD string comparison works correctly)
  const inDateRange = (dateStr) => {
    if (!from && !to) return true;
    if (!dateStr) return false;
    const d = String(dateStr).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  };

  const [students, targets, expenses] = await Promise.all([
    Student.find({
      status: { $nin: ['dropped'] },
      startDate: { $exists: true, $ne: '' },
      $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
    }).select('startDate coursePrice amount tuitionStatus level className'),
    Revenue.find().select('month target'),
    Expense.find(),
  ]);

  // Build expense map — filter by paidAt date, fallback to month-01
  const expenseMap = {};
  let totalExpenses = 0;
  expenses.forEach(e => {
    const key = e.month;
    if (!key) return;
    const paidDate = e.paidAt
      ? new Date(e.paidAt).toISOString().slice(0, 10)
      : `${key}-01`;
    if (!inDateRange(paidDate)) return;
    if (!expenseMap[key]) expenseMap[key] = { salary:0, rent:0, marketing:0, utilities:0, other:0, total:0 };
    const cat = e.category || 'other';
    expenseMap[key][cat] = (expenseMap[key][cat] || 0) + (e.amount || 0);
    expenseMap[key].total += e.amount || 0;
    totalExpenses += e.amount || 0;
  });

  // Build month map — filter students by exact startDate
  const monthMap = {};
  students.forEach(s => {
    const dateKey = (s.startDate || '').slice(0, 10); // YYYY-MM-DD
    const key = dateKey.slice(0, 7);                  // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    if (!inDateRange(dateKey)) return;
    if (!monthMap[key]) {
      monthMap[key] = {
        revenue: 0, collected: 0,
        breakdown: { beginner: 0, intermediate: 0, topik: 0, conversation: 0 },
      };
    }
    const rev = (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
    monthMap[key].revenue   += rev;
    monthMap[key].collected += s.amount || 0;
    const cat = getCourseCategory(s.level);
    monthMap[key].breakdown[cat] = (monthMap[key].breakdown[cat] || 0) + rev;
  });

  // Build target lookup — support both 'YYYY-MM' and legacy 'Tháng M/YYYY'
  const targetMap = {};
  targets.forEach(t => {
    const raw = t.month || '';
    if (/^\d{4}-\d{2}$/.test(raw)) {
      targetMap[raw] = t.target || 0;
    } else {
      const m = raw.match(/(\d+)\/(\d{4})/);
      if (m) targetMap[`${m[2]}-${m[1].padStart(2, '0')}`] = t.target || 0;
    }
  });

  // totalDebt: students within date range who haven't fully paid
  const totalDebt = students
    .filter(s => {
      const dateKey = (s.startDate || '').slice(0, 10);
      return inDateRange(dateKey) && s.tuitionStatus !== 'paid' && (s.coursePrice || 0) > 0;
    })
    .reduce((sum, s) => sum + Math.max(0, (s.coursePrice || 0) - (s.amount || 0)), 0);

  // Add expense-only months (months with in-range expenses but no students)
  Object.keys(expenseMap).forEach(key => {
    if (!monthMap[key]) {
      monthMap[key] = { revenue: 0, collected: 0, breakdown: { beginner:0, intermediate:0, topik:0, conversation:0 } };
    }
  });

  const rows = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [year, mo] = key.split('-');
      return {
        _month:    key,
        month:     `Tháng ${parseInt(mo)}/${year}`,
        shortMonth: `T${parseInt(mo)}`,
        revenue:   data.revenue,
        target:    targetMap[key] || 0,
        collected: data.collected,
        breakdown: data.breakdown,
        expenses: expenseMap[key] || { salary:0, rent:0, marketing:0, utilities:0, other:0, total:0 },
        profit: data.collected - (expenseMap[key]?.total || 0),
      };
    });

  success(res, { rows, totalDebt, totalExpenses });
  } catch (err) { next(err); }
};

// GET /admin/revenue/breakdown — aggregated totals + category breakdown for the 3 KPI boxes
// Always returns all-time data — no date filter (independent from the chart section)
exports.getBreakdown = async (req, res, next) => {
  try {
    const [students, expenses] = await Promise.all([
      Student.find({
        status: { $nin: ['dropped'] },
        startDate: { $exists: true, $ne: '' },
        $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
      }).select('startDate coursePrice amount tuitionStatus level'),
      Expense.find(),
    ]);

    const revenueBreakdown = { beginner: 0, intermediate: 0, topik: 0, conversation: 0 };
    const byMonth = {};
    let totalRevenue = 0, totalCollected = 0, totalDebt = 0;

    students.forEach(s => {
      const dateKey = (s.startDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}/.test(dateKey)) return;
      const mk = dateKey.slice(0, 7);
      const rev = (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
      totalRevenue   += rev;
      totalCollected += s.amount || 0;
      const cat = getCourseCategory(s.level);
      revenueBreakdown[cat] += rev;
      if (!byMonth[mk]) byMonth[mk] = { revenue:0, collected:0, expenses:{ salary:0,rent:0,marketing:0,utilities:0,other:0,total:0 }, breakdown:{ beginner:0,intermediate:0,topik:0,conversation:0 } };
      byMonth[mk].revenue   += rev;
      byMonth[mk].collected += s.amount || 0;
      byMonth[mk].breakdown[cat] += rev;
      if (s.tuitionStatus !== 'paid' && (s.coursePrice || 0) > 0)
        totalDebt += Math.max(0, (s.coursePrice || 0) - (s.amount || 0));
    });

    const expenseBreakdown = { salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0 };
    let totalExpenses = 0;

    expenses.forEach(e => {
      const mk = e.month;
      if (!mk) return;
      const cat = e.category || 'other';
      expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + (e.amount || 0);
      totalExpenses += e.amount || 0;
      if (!byMonth[mk]) byMonth[mk] = { revenue:0, collected:0, expenses:{ salary:0,rent:0,marketing:0,utilities:0,other:0,total:0 }, breakdown:{ beginner:0,intermediate:0,topik:0,conversation:0 } };
      byMonth[mk].expenses[cat] = (byMonth[mk].expenses[cat] || 0) + (e.amount || 0);
      byMonth[mk].expenses.total += e.amount || 0;
    });

    const months = Object.keys(byMonth).sort();
    months.forEach(mk => {
      const [yr, mo] = mk.split('-');
      byMonth[mk].month   = `Tháng ${parseInt(mo)}/${yr}`;
      byMonth[mk].profit  = byMonth[mk].collected - byMonth[mk].expenses.total;
    });

    success(res, { totalRevenue, totalCollected, totalExpenses, totalDebt, revenueBreakdown, expenseBreakdown, months, byMonth });
  } catch (err) { next(err); }
};

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
