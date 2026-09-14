const Revenue = require('../models/Revenue');
const Student  = require('../models/Student');
const Expense  = require('../models/Expense');
const Payment  = require('../models/Payment');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Payment.paidAt lưu kiểu Date (UTC). Doanh thu phải cắt tháng theo giờ VIỆT NAM:
// một khoản đóng lúc 0h30 ngày 01/10 giờ VN được lưu là 17h30 ngày 30/09 UTC —
// cắt theo UTC sẽ đẩy nhầm sang tháng 9.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnDateStr(d) {
  return new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function getCourseCategory(level) {
  if (!level) return 'conversation';
  const l = level.toLowerCase();
  if (l.includes('lộ trình') || l.includes('lo trinh') || l.includes('combo')) return 'bundle';
  if (l.includes('sơ cấp') || l.includes('so cap')) return 'beginner';
  if (l.includes('trung cấp') || l.includes('trung cap')) return 'intermediate';
  if (l.includes('topik')) return 'topik';
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

  const [students, targets, expenses, payments] = await Promise.all([
    Student.find({
      status: { $nin: ['dropped'] },
      startDate: { $exists: true, $ne: '' },
      $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
    }).select('startDate coursePrice amount tuitionStatus level className'),
    Revenue.find().select('month target'),
    Expense.find(),
    Payment.find().select('studentId amount paidAt'),
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

  // 2 con số khác hẳn nhau, KHÔNG cộng vào nhau:
  //   revenue   = HỌC PHÍ KÝ MỚI — tổng học phí của học sinh khai giảng trong tháng,
  //               ghi trọn gói 1 lần theo startDate (dù chưa đóng đồng nào).
  //   collected = DOANH THU — tiền học phí THỰC NHẬN, gom theo ngày đóng (Payment.paidAt,
  //               giờ VN). Đây mới là con số dùng để tính lợi nhuận.
  const monthMap = {};
  const ensureMonth = key => {
    if (!monthMap[key]) {
      monthMap[key] = {
        revenue: 0, collected: 0, hasEstimated: false,
        breakdown: { beginner: 0, intermediate: 0, topik: 0, conversation: 0, bundle: 0 },
      };
    }
    return monthMap[key];
  };

  // Học sinh ĐÃ có bản ghi Payment → tiền của họ luôn lấy theo ngày đóng thật.
  const paidStudentIds = new Set(payments.map(p => String(p.studentId)));

  // Học phí ký mới — theo ngày khai giảng.
  students.forEach(s => {
    const dateKey = (s.startDate || '').slice(0, 10); // YYYY-MM-DD
    const key = dateKey.slice(0, 7);                  // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    if (!inDateRange(dateKey)) return;
    const rev = (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
    const m = ensureMonth(key);
    m.revenue += rev;
    const cat = getCourseCategory(s.level);
    m.breakdown[cat] = (m.breakdown[cat] || 0) + rev;
  });

  // Doanh thu — theo ngày đóng thật.
  payments.forEach(p => {
    const dateKey = vnDateStr(p.paidAt);
    if (!inDateRange(dateKey)) return;
    ensureMonth(dateKey.slice(0, 7)).collected += p.amount || 0;
  });

  // Dự phòng cho dữ liệu CŨ: trước đây admin gõ thẳng số tiền đã đóng vào form học
  // sinh, không sinh bản ghi Payment nào — những khoản đó không có ngày đóng để gom.
  // Bỏ qua thì doanh thu các tháng cũ tụt về 0, nên vẫn tính vào tháng khai giảng như
  // cách cũ và đánh dấu hasEstimated để FE nói rõ đây là số ước lượng.
  students.forEach(s => {
    if (paidStudentIds.has(String(s._id))) return;
    if (!(s.amount > 0)) return;
    const dateKey = (s.startDate || '').slice(0, 10);
    const key = dateKey.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    if (!inDateRange(dateKey)) return;
    const m = ensureMonth(key);
    m.collected += s.amount;
    m.hasEstimated = true;
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

  // Công nợ = DƯ NỢ HIỆN TẠI của toàn bộ học sinh, KHÔNG lọc theo tháng: học phí ký
  // và tiền đóng nay nằm ở 2 mốc thời gian khác nhau nên "nợ trong 1 tháng" không còn
  // nghĩa. Đây là số dư tại thời điểm xem.
  const totalDebt = students.reduce(
    (sum, s) => sum + ((s.coursePrice || 0) > 0 ? Math.max(0, s.coursePrice - (s.amount || 0)) : 0), 0);

  // Add expense-only months (months with in-range expenses but no students)
  Object.keys(expenseMap).forEach(ensureMonth);

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
        // true = tháng này còn tiền lấy từ dữ liệu cũ (không có ngày đóng thật)
        hasEstimated: data.hasEstimated,
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
    const [students, expenses, payments] = await Promise.all([
      Student.find({
        status: { $nin: ['dropped'] },
        startDate: { $exists: true, $ne: '' },
        $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
      }).select('startDate coursePrice amount tuitionStatus level'),
      Expense.find(),
      Payment.find().select('studentId amount paidAt'),
    ]);

    const revenueBreakdown = { beginner: 0, intermediate: 0, topik: 0, conversation: 0, bundle: 0 };
    const byMonth = {};
    const ensureMonth = mk => {
      if (!byMonth[mk]) byMonth[mk] = { revenue:0, collected:0, hasEstimated:false, expenses:{ salary:0,rent:0,marketing:0,utilities:0,other:0,total:0 }, breakdown:{ beginner:0,intermediate:0,topik:0,conversation:0,bundle:0 } };
      return byMonth[mk];
    };
    let totalRevenue = 0, totalCollected = 0, totalDebt = 0;
    const paidStudentIds = new Set(payments.map(p => String(p.studentId)));

    // Học phí ký mới + dư nợ — theo ngày khai giảng. Xem chú thích ở getSummary:
    // revenue và collected là 2 con số khác nhau, không cộng vào nhau.
    students.forEach(s => {
      const dateKey = (s.startDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}/.test(dateKey)) return;
      const mk = dateKey.slice(0, 7);
      const rev = (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
      totalRevenue += rev;
      const cat = getCourseCategory(s.level);
      revenueBreakdown[cat] += rev;
      const m = ensureMonth(mk);
      m.revenue += rev;
      m.breakdown[cat] += rev;
      if ((s.coursePrice || 0) > 0) totalDebt += Math.max(0, s.coursePrice - (s.amount || 0));
    });

    // Doanh thu — theo ngày đóng thật (giờ VN).
    payments.forEach(p => {
      const mk = vnDateStr(p.paidAt).slice(0, 7);
      totalCollected += p.amount || 0;
      ensureMonth(mk).collected += p.amount || 0;
    });

    // Dự phòng cho dữ liệu cũ không có ngày đóng — xem getSummary.
    students.forEach(s => {
      if (paidStudentIds.has(String(s._id)) || !(s.amount > 0)) return;
      const mk = (s.startDate || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mk)) return;
      totalCollected += s.amount;
      const m = ensureMonth(mk);
      m.collected += s.amount;
      m.hasEstimated = true;
    });

    const expenseBreakdown = { salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0 };
    let totalExpenses = 0;

    expenses.forEach(e => {
      const mk = e.month;
      if (!mk) return;
      const cat = e.category || 'other';
      expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + (e.amount || 0);
      totalExpenses += e.amount || 0;
      ensureMonth(mk);
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

// GET /admin/revenue/payments — DANH SÁCH từng khoản thu được tính vào doanh thu,
// phân trang phía server. Dùng đúng quy tắc lọc của getSummary để tổng của bảng luôn
// khớp thẻ "Doanh thu": khoản thu thật lọc theo paidAt (giờ VN), cộng thêm các dòng
// ƯỚC LƯỢNG của học sinh chưa từng có bản ghi Payment (tiền cũ nhập tay, không có ngày).
//
// total/totalAmount tính trên TOÀN BỘ kỳ chứ không phải trang hiện tại — dòng tổng ở
// chân bảng phải khớp thẻ dù đang đứng ở trang nào.
exports.getPaymentList = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const inRange = d => (!from || d >= from) && (!to || d <= to);

    const [payments, students] = await Promise.all([
      Payment.find().select('studentId studentName className courseCategory amount paidAt note').lean(),
      Student.find({
        status: { $nin: ['dropped'] },
        startDate: { $exists: true, $ne: '' },
        $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
      }).select('name className level startDate amount').lean(),
    ]);

    const paidStudentIds = new Set(payments.map(p => String(p.studentId)));
    // Ngày khai giảng tra theo học sinh — để bảng có cột riêng cho CẢ khoản thu thật,
    // không riêng dòng ước lượng. Không tốn thêm truy vấn vì students đã nạp ở trên.
    // Khoản thu của học sinh đã nghỉ (không nằm trong students) thì để null.
    const startDateById = new Map(students.map(s => [String(s._id), (s.startDate || '').slice(0, 10) || null]));
    const rows = [];

    payments.forEach(p => {
      const date = vnDateStr(p.paidAt);
      if (!inRange(date)) return;
      rows.push({
        _id: String(p._id), date, startDate: startDateById.get(String(p.studentId)) || null,
        studentName: p.studentName || '', className: p.className || '',
        courseCategory: p.courseCategory || '', amount: p.amount || 0,
        note: p.note || '', estimated: false,
      });
    });

    students.forEach(s => {
      if (paidStudentIds.has(String(s._id)) || !(s.amount > 0)) return;
      const startDate = (s.startDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !inRange(startDate)) return;
      rows.push({
        _id: `est-${s._id}`, date: null, startDate,
        studentName: s.name || '', className: s.className || '',
        courseCategory: getCourseCategory(s.level), amount: s.amount,
        note: '', estimated: true,
      });
    });

    // Mới nhất trước. Dòng ước lượng không có ngày đóng nên xếp theo ngày khai giảng.
    rows.sort((a, b) => (b.date || b.startDate || '').localeCompare(a.date || a.startDate || ''));

    success(res, {
      items: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
      estimatedAmount: rows.reduce((sum, r) => sum + (r.estimated ? r.amount : 0), 0),
      page, limit,
    });
  } catch (err) { next(err); }
};

// GET /admin/revenue/new-contracts — DANH SÁCH học sinh khai giảng trong kỳ (học phí
// ký mới), phân trang phía server. Lọc theo startDate giống hệt phần revenue của
// getSummary. Ở đây phân trang được ngay trong DB vì chỉ đọc 1 collection.
exports.getNewContractList = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const startDateCond = { $exists: true, $ne: '' };
    if (from) startDateCond.$gte = from;
    if (to)   startDateCond.$lte = to;
    const filter = {
      status: { $nin: ['dropped'] },
      startDate: startDateCond,
      $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
    };

    // contractValue: học phí ký — coursePrice, rơi về amount khi chưa nhập học phí.
    // Phải khớp đúng công thức revenue ở getSummary, nếu không tổng bảng sẽ lệch thẻ.
    const contractValue = { $cond: [{ $gt: ['$coursePrice', 0] }, '$coursePrice', '$amount'] };

    const [total, students, sums] = await Promise.all([
      Student.countDocuments(filter),
      Student.find(filter).select('name className level startDate coursePrice amount tuitionStatus')
        .sort({ startDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Student.aggregate([
        { $match: filter },
        { $group: { _id: null, totalContract: { $sum: contractValue }, totalPaid: { $sum: '$amount' } } },
      ]),
    ]);

    success(res, {
      items: students.map(s => {
        const contract = (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
        return {
          _id: String(s._id), startDate: (s.startDate || '').slice(0, 10),
          studentName: s.name || '', className: s.className || '',
          courseCategory: getCourseCategory(s.level), level: s.level || '',
          contract, paid: s.amount || 0,
          remaining: Math.max(0, contract - (s.amount || 0)),
          tuitionStatus: s.tuitionStatus || 'unpaid',
        };
      }),
      total,
      totalContract: sums[0]?.totalContract || 0,
      totalPaid: sums[0]?.totalPaid || 0,
      page, limit,
    });
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
