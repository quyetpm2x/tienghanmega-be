const { paymentState } = require('./packageMath');
const { buildAdminPaymentHistory } = require('./paymentHistory');

// Payment.paidAt lưu kiểu Date (UTC). Cắt ngày theo giờ VIỆT NAM: khoản đóng lúc 0h30
// ngày 01/10 giờ VN được lưu là 17h30 ngày 30/09 UTC — cắt theo UTC sẽ đẩy nhầm tháng.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function vnDateStr(d) {
  return new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const EMPTY_BREAKDOWN = () => ({ beginner: 0, intermediate: 0, topik: 0, conversation: 0, bundle: 0 });
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Khoá bucket theo độ phân giải ────────────────────────────────────────────────────────
// Mọi mốc thời gian ở đây đã là chuỗi ngày giờ VN (qua vnDateStr), nên bên trong chỉ cần số
// học lịch thuần bằng UTC — không còn lệch múi giờ nào nữa.
const GRAINS = ['day', 'week', 'month'];
const DAY_MS = 24 * 60 * 60 * 1000;

const utcOf = dateStr => new Date(`${dateStr}T00:00:00.000Z`);
const isoOf = d => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => isoOf(new Date(utcOf(dateStr).getTime() + n * DAY_MS));

// Thứ 2 của tuần chứa ngày này (ISO: tuần chạy T2 → CN).
function isoWeekStart(dateStr) {
  const mondayIndex = (utcOf(dateStr).getUTCDay() + 6) % 7;  // CN=0 của JS → T2=0
  return addDays(dateStr, -mondayIndex);
}

// Khoá tuần ISO `YYYY-Www`. Năm trong khoá là NĂM ISO — năm chứa thứ Năm của tuần đó, không
// phải năm của ngày truyền vào. Nhờ vậy tuần chéo năm (29/12/2025 – 04/01/2026) nằm trọn
// trong đúng một khoá thay vì bị cắt đôi.
function isoWeekKeyOf(dateStr) {
  const thursday = addDays(isoWeekStart(dateStr), 3);
  const isoYear = Number(thursday.slice(0, 4));
  // Tuần 1 là tuần chứa thứ Năm đầu tiên của năm ISO, nên số tuần đếm thẳng từ 01/01.
  const week = Math.floor((utcOf(thursday) - utcOf(`${isoYear}-01-01`)) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// Ngày đầu/cuối của một khoá tuần ISO — nghịch đảo của isoWeekKeyOf.
function isoWeekRange(key) {
  const [year, week] = key.split('-W').map(Number);
  // 04/01 luôn thuộc tuần 1 theo định nghĩa ISO, nên thứ 2 của tuần 1 suy từ nó.
  const week1Monday = isoWeekStart(`${year}-01-04`);
  const start = addDays(week1Monday, (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

function bucketKeyOf(dateStr, grain) {
  if (grain === 'day') return dateStr;
  if (grain === 'week') return isoWeekKeyOf(dateStr);
  return dateStr.slice(0, 7);
}

function bucketRangeOf(key, grain) {
  if (grain === 'day') return { start: key, end: key };
  if (grain === 'week') return isoWeekRange(key);
  const [year, month] = key.split('-').map(Number);
  return { start: `${key}-01`, end: isoOf(new Date(Date.UTC(year, month, 0))) };
}

// Sự thật tiền của từng gói. Quy tắc tháng chốt: TOÀN BỘ học phí ghi nhận vào kỳ ĐỒNG TIỀN
// ĐẦU TIÊN về, không rải theo từng lần đóng.
//
// "Đồng tiền đầu tiên" tính CẢ khoản không có bản ghi thanh toán. Bản trước chỉ nhìn Payment,
// nên một gói đã chốt từ tháng 7 bằng tiền nhập tay chỉ cần ghi thêm một khoản có chứng từ
// hôm nay là cả hợp đồng nhảy sang hôm nay — doanh thu quá khứ bốc hơi, doanh thu hôm nay
// phồng lên. Giờ dùng chung bộ dòng tiền với biểu đồ thực thu (packageCashLines) rồi lấy
// dòng sớm nhất, nên hai bên không thể nói khác nhau về ngày gói bắt đầu có tiền.
//
// `estimated` = dòng sớm nhất KHÔNG phải bản ghi thanh toán → ngày là suy ra, số tiền vẫn đúng.
function packageFacts(packages, payments, { studentCreatedAt = new Map() } = {}) {
  const byPkg = new Map();
  for (const p of payments) {
    if (!p.packageId) continue;
    const id = String(p.packageId);
    if (!byPkg.has(id)) byPkg.set(id, []);
    byPkg.get(id).push(p);
  }

  const facts = new Map();
  for (const pkg of packages) {
    const id = String(pkg._id);
    const list = byPkg.get(id) || [];
    const paymentsTotal = list.reduce((sum, p) => sum + (p.amount || 0), 0);
    const state = paymentState({ netTotal: pkg.netTotal, paymentsTotal, paidAdjustment: pkg.paidAdjustment });

    let close = null;
    if (state.paidRaw > 0) {
      const lines = packageCashLines(pkg, state, list, studentCreatedAt.get(String(pkg.studentId)));
      const first = lines.reduce((a, b) => (!a || b.date < a.date ? b : a), null);
      if (first) close = { date: first.date, month: first.date.slice(0, 7), estimated: first.type !== 'payment' };
    }
    facts.set(id, { paymentsTotal, ...state, close });
  }
  return facts;
}

// Gom theo tháng chốt. Khoá đã nghỉ giữa chừng VẪN tính (doanh thu đã ghi nhận giữ
// nguyên). Cơ cấu theo loại khoá dùng giá bán sau giảm của từng ghi danh.
function aggregateByBucket(packages, facts, { from, to, grain = 'month' } = {}) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const months = {};
  for (const pkg of packages) {
    const f = facts.get(String(pkg._id));
    if (!f || !f.close || !inRange(f.close.date)) continue;
    const key = bucketKeyOf(f.close.date, grain);
    const m = months[key] || (months[key] = {
      revenue: 0, collected: 0, debt: 0, hasEstimated: false, breakdown: EMPTY_BREAKDOWN(),
    });
    m.revenue += pkg.netTotal || 0;
    m.collected += f.paid;
    m.debt += f.debt;
    if (f.close.estimated) m.hasEstimated = true;
    for (const e of pkg.enrollments || []) {
      // `in` đi cả chuỗi prototype: loại khoá tên "constructor"/"toString" lọt qua, rồi
      // `m.breakdown[cat] += ...` nối chuỗi vào một function thay vì cộng số. Class và
      // phases[].courseCategory là chuỗi tự do nên chuyện này đến được dữ liệu thật.
      const cat = Object.prototype.hasOwnProperty.call(m.breakdown, e.courseCategory)
        ? e.courseCategory : 'conversation';
      m.breakdown[cat] += e.netPrice || 0;
    }
  }
  return months;
}

// Giữ nguyên chữ ký cũ cho mọi call site đang gom theo tháng.
function aggregateByMonth(packages, facts, opts = {}) {
  return aggregateByBucket(packages, facts, { ...opts, grain: 'month' });
}

// Mốc ngày cho phần tiền không có bản ghi thanh toán, lấy cái sát thực tế nhất còn dùng được.
// Gói sinh ra từ script chuyển đổi có createdAt = NGÀY CHẠY SCRIPT — dùng thẳng sẽ dồn toàn
// bộ tiền cũ vào đúng một ngày, nên phải bỏ qua và lùi về ngày thêm học sinh (học sinh có
// trước khi migrate nên createdAt của họ vẫn là mốc thật).
// Ngày khai giảng sớm nhất trong gói.
function earliestStartOf(pkg) {
  return (pkg.enrollments || [])
    .map(e => (e.startDate || '').slice(0, 10))
    .filter(d => VALID_DATE.test(d))
    .sort()[0] || null;
}

function fallbackCashDate(pkg, studentCreatedAt, closeDate) {
  if (!pkg.migratedAt && pkg.createdAt) return vnDateStr(pkg.createdAt);
  if (studentCreatedAt) return vnDateStr(studentCreatedAt);
  return closeDate || null;
}

// Tiền mặt THỰC THU: gom theo ngày TIỀN VỀ của từng khoản, khác hẳn `collected` (gán trọn
// vào kỳ CHỐT của gói). Ở grain tháng hai số gần như trùng nhau nên trước giờ gộp làm một; ở
// grain ngày thì lệch hẳn — cọc 500k ngày 01/09 rồi đóng nốt 5tr ngày 20/09, gom theo kỳ chốt
// sẽ báo "ngày 01/09 thu 5,5tr, ngày 20/09 thu 0đ".
//
// Chia tiền của mỗi gói bằng ĐÚNG hàm dựng "Lịch sử đóng tiền" mà học sinh đang xem
// (buildPaymentHistory), nên biểu đồ và màn hình đó không thể kể hai câu chuyện khác nhau:
// mỗi dòng ở đó là một khoản tiền trên biểu đồ này, và tổng luôn bằng số đã nộp.
//
//   type 'payment' → ngày đóng thật (Payment.paidAt)          — số đo được
//   type 'manual'  → ngày admin ghi nhận (changedAt)          — số suy ra
//   type 'legacy'  → phần không truy được nguồn, legacyDate   — số suy ra
// Dòng tiền của MỘT gói, mỗi dòng đã quy về ngày giờ VN. Đây là nguồn DUY NHẤT cho cả biểu
// đồ lẫn bảng "tiền đã nhận", nên hai chỗ đó không thể cộng ra hai con số khác nhau.
function packageCashLines(pkg, f, payments, studentCreatedAt) {
  const lines = buildAdminPaymentHistory({
    payments,
    adjustmentHistory: pkg.adjustmentHistory || [],
    // paidRaw chứ không phải paid: đóng dư là tiền THẬT đi qua két, không kẹp như công nợ.
    paid: Math.max(f.paidRaw || 0, 0),
    // Nấc cuối là ngày khai giảng, KHÔNG phải ngày chốt: ngày chốt giờ suy từ chính các dòng
    // này nên lấy nó làm đầu vào sẽ thành vòng tròn.
    legacyDate: fallbackCashDate(pkg, studentCreatedAt, earliestStartOf(pkg)),
  });
  // Hết mốc để gán thì bỏ, thà thiếu một khoản còn hơn đặt nó vào một ngày bịa.
  return lines.filter(it => it.date).map(it => ({ ...it, date: vnDateStr(it.date) }));
}

// Duyệt mọi dòng tiền nằm trong khoảng. Biểu đồ và bảng chi tiết đều đi qua đây.
function eachCashLine(packages, facts, { paymentsByPkg, studentCreatedAt, from, to }, visit) {
  for (const pkg of packages) {
    const id = String(pkg._id);
    const f = facts.get(id);
    if (!f) continue;
    const lines = packageCashLines(pkg, f, paymentsByPkg.get(id) || [], studentCreatedAt.get(String(pkg.studentId)));
    for (const it of lines) {
      if ((from && it.date < from) || (to && it.date > to)) continue;
      visit(it, pkg, f);
    }
  }
}

function aggregateCashByBucket(packages, facts, opts) {
  const grain = opts.grain || 'month';
  const byBucket = {};
  const noRecordByBucket = {};
  eachCashLine(packages, facts, opts, it => {
    const key = bucketKeyOf(it.date, grain);
    byBucket[key] = (byBucket[key] || 0) + it.amount;
    if (it.type !== 'payment') noRecordByBucket[key] = (noRecordByBucket[key] || 0) + it.amount;
  });
  return { byBucket, noRecordByBucket };
}

// Khoản chi thuộc tháng nào: theo NGÀY CHI (giờ VN), không theo nhãn "tháng" admin chọn lúc
// nhập — hai thứ này lệch nhau được (chi 16/08 nhưng gắn nhãn tháng 9), mà mọi màn hình đều
// lọc theo ngày chi. Lấy theo nhãn sẽ đẩy khoản chi sang tháng khác và kéo theo cả lương của
// tháng đó vào tổng chi phí. Không có ngày chi thì đành dùng nhãn.
function expenseMonthKey(e) {
  return e.paidAt ? vnDateStr(e.paidAt).slice(0, 7) : (e.month || '');
}

const emptyExpenseBucket = () => ({ salary: 0, rent: 0, marketing: 0, utilities: 0, other: 0, total: 0 });

// Ngày chi dùng để xếp bucket. Khoản cũ không có ngày chi thì đành lấy mùng 1 của nhãn tháng
// — ở grain tháng vẫn đúng bucket, ở grain ngày/tuần là phỏng đoán tốt nhất có thể.
function expenseDateOf(e) {
  if (e.paidAt) return vnDateStr(e.paidAt);
  return e.month ? `${e.month}-01` : '';
}

// Gom khoản chi theo bucket của ngày chi, chỉ lấy các khoản nằm trong khoảng (nếu có).
function bucketExpensesBy(expenses, { from, to, grain = 'month' } = {}) {
  const byBucket = {};
  let total = 0;
  for (const e of expenses) {
    const paidDate = expenseDateOf(e);
    if (!paidDate) continue;
    if ((from && paidDate < from) || (to && paidDate > to)) continue;
    const key = bucketKeyOf(paidDate, grain);
    if (!byBucket[key]) byBucket[key] = emptyExpenseBucket();
    const cat = e.category || 'other';
    byBucket[key][cat] = (byBucket[key][cat] || 0) + (e.amount || 0);
    byBucket[key].total += e.amount || 0;
    total += e.amount || 0;
  }
  return { byBucket, total };
}

// Giữ nguyên chữ ký cũ (`byMonth`) cho mọi call site đang gom theo tháng.
function bucketExpenses(expenses, opts = {}) {
  const { byBucket, total } = bucketExpensesBy(expenses, { ...opts, grain: 'month' });
  return { byMonth: byBucket, total };
}

module.exports = {
  vnDateStr, packageFacts, aggregateByMonth, EMPTY_BREAKDOWN, VN_OFFSET_MS,
  expenseMonthKey, bucketExpenses, emptyExpenseBucket,
  GRAINS, isoWeekKeyOf, isoWeekRange, bucketKeyOf, bucketRangeOf,
  aggregateByBucket, aggregateCashByBucket, packageCashLines, eachCashLine,
  fallbackCashDate, earliestStartOf,
  bucketExpensesBy, expenseDateOf,
};
