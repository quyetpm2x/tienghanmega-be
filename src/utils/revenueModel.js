const { paymentState } = require('./packageMath');

// Payment.paidAt lưu kiểu Date (UTC). Cắt ngày theo giờ VIỆT NAM: khoản đóng lúc 0h30
// ngày 01/10 giờ VN được lưu là 17h30 ngày 30/09 UTC — cắt theo UTC sẽ đẩy nhầm tháng.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnDateStr(d) {
  return new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const EMPTY_BREAKDOWN = () => ({ beginner: 0, intermediate: 0, topik: 0, conversation: 0, bundle: 0 });
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Sự thật tiền của từng gói. Quy tắc tháng chốt (TOÀN BỘ học phí ghi nhận vào tháng
// học sinh đóng tiền LẦN ĐẦU cho gói, không rải theo từng lần đóng):
//  • Có Payment → ngày của khoản đóng sớm nhất (giờ VN).
//  • Không có Payment nhưng paidRaw > 0 (tiền cũ nhập tay) → ngày khai giảng sớm nhất
//    trong gói, gắn cờ ước lượng.
//  • Còn lại → chưa chốt, không vào doanh thu tháng nào.
function packageFacts(packages, payments) {
  const byPkg = new Map();
  for (const p of payments) {
    if (!p.packageId) continue;
    const id = String(p.packageId);
    const date = vnDateStr(p.paidAt);
    const cur = byPkg.get(id) || { total: 0, first: null };
    cur.total += p.amount || 0;
    if (!cur.first || date < cur.first) cur.first = date;
    byPkg.set(id, cur);
  }

  const facts = new Map();
  for (const pkg of packages) {
    const id = String(pkg._id);
    const agg = byPkg.get(id) || { total: 0, first: null };
    const state = paymentState({ netTotal: pkg.netTotal, paymentsTotal: agg.total, paidAdjustment: pkg.paidAdjustment });

    let close = null;
    if (agg.first) {
      close = { date: agg.first, month: agg.first.slice(0, 7), estimated: false };
    } else if (state.paidRaw > 0) {
      const earliest = (pkg.enrollments || [])
        .map(e => (e.startDate || '').slice(0, 10))
        .filter(d => VALID_DATE.test(d))
        .sort()[0];
      if (earliest) close = { date: earliest, month: earliest.slice(0, 7), estimated: true };
    }
    facts.set(id, { paymentsTotal: agg.total, ...state, close });
  }
  return facts;
}

// Gom theo tháng chốt. Khoá đã nghỉ giữa chừng VẪN tính (doanh thu đã ghi nhận giữ
// nguyên). Cơ cấu theo loại khoá dùng giá bán sau giảm của từng ghi danh.
function aggregateByMonth(packages, facts, { from, to } = {}) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const months = {};
  for (const pkg of packages) {
    const f = facts.get(String(pkg._id));
    if (!f || !f.close || !inRange(f.close.date)) continue;
    const m = months[f.close.month] || (months[f.close.month] = {
      revenue: 0, collected: 0, debt: 0, hasEstimated: false, breakdown: EMPTY_BREAKDOWN(),
    });
    m.revenue += pkg.netTotal || 0;
    m.collected += f.paid;
    m.debt += f.debt;
    if (f.close.estimated) m.hasEstimated = true;
    for (const e of pkg.enrollments || []) {
      const cat = e.courseCategory in m.breakdown ? e.courseCategory : 'conversation';
      m.breakdown[cat] += e.netPrice || 0;
    }
  }
  return months;
}

module.exports = { vnDateStr, packageFacts, aggregateByMonth, EMPTY_BREAKDOWN, VN_OFFSET_MS };
