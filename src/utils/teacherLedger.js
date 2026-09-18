// Sổ lương phẳng + quy đổi "kỳ lương" cho 1 giáo viên — bản Node của
// tienhanmega-fe/lib/teacherSchedule.ts + lib/teacherSalary.ts, dùng riêng cho
// endpoint /teacher-portal/salary (tienh viên chỉ nhận số tiền cuối cùng, không
// lộ ratePerSession/dữ liệu giáo viên khác qua network). Phải giữ đúng cùng công
// thức "kỳ lương" (payPeriodLabel/Bounds) với bản admin để 2 bên luôn khớp số.

const { belongsToClass } = require('./classLink');
const { rateAt } = require('./classRate');
const { scheduledDatesOfClass, phaseAt } = require('./classPhase');
const { effectiveAssignments } = require('./classAssignment');
const { resolveSession, paidTeacherIdOf } = require('./sessionPay');

const DEFAULT_PAY_PERIOD_START_DAY = 10;

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDateLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Parse "YYYY-MM-DD" thành nửa đêm GIỜ ĐỊA PHƯƠNG. KHÔNG dùng `new Date(str)`: chuỗi dạng
// này được parse thành nửa đêm UTC, rồi getDay()/getFullYear() lại đọc theo giờ địa phương —
// ở múi giờ ÂM (VD America/New_York) nó lùi về ngày hôm trước, làm lịch lớp mất buổi cuối
// khoá và đẻ thêm buổi trước ngày khai giảng. Tách số ra rồi dựng ngày địa phương thì đúng
// ở mọi múi giờ, không phải dựa vào việc ghim TZ.
const parseLocalDate = (str) => { const [y, m, d] = String(str).split('-').map(Number); return new Date(y, m - 1, d); };

function todayDateStr() {
  return fmtDateLocal(new Date());
}

function payPeriodLabel(dateISO, startDay = DEFAULT_PAY_PERIOD_START_DAY) {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (d >= startDay) return `${y}-${pad2(m)}`;
  const prev = new Date(y, m - 2, 1);
  return `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
}

function payPeriodBounds(label, startDay = DEFAULT_PAY_PERIOD_START_DAY) {
  const [y, m] = label.split('-').map(Number);
  const start = new Date(y, m - 1, startDay);
  const end = new Date(y, m, startDay - 1);
  return { start: fmtDateLocal(start), end: fmtDateLocal(end) };
}

function currentPayPeriodLabel(startDay = DEFAULT_PAY_PERIOD_START_DAY) {
  return payPeriodLabel(todayDateStr(), startDay);
}

const WEEKDAY_TO_JS = { T2: 1, T3: 2, T4: 3, T5: 4, T6: 5, T7: 6, CN: 0 };

function scheduledDates(from, to, daysStr) {
  if (!from || !to || !daysStr) return [];
  const days = daysStr.split(',').map((s) => s.trim()).filter(Boolean);
  const selected = new Set(days.map((d) => WEEKDAY_TO_JS[d]).filter((n) => n !== undefined));
  if (selected.size === 0) return [];
  const dates = [];
  const cur = parseLocalDate(from);
  const end = parseLocalDate(to);
  while (cur <= end) {
    if (selected.has(cur.getDay())) dates.push(fmtDateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Buổi dạy CỦA RIÊNG 1 giáo viên (theo teacherId) — chỉ tính buổi rơi đúng vào
// đoạn thời gian họ phụ trách lớp đó (không tính buổi trước/sau khi đổi giáo viên).
// status==='substituted' loại buổi đó khỏi số buổi của giáo viên GỐC (không phải họ
// dạy) — xem thêm pass thứ 2 bên dưới, cộng buổi đó ngược lại cho giáo viên DẠY THAY.
// Thời điểm "sửa sau cùng" của một bản ghi buổi dạy (updatedAt, rồi createdAt, rồi thời
// điểm tạo nằm trong ObjectId).
function editedAt(s) {
  const t = s.updatedAt || s.createdAt;
  if (t) return new Date(t).getTime();
  const id = String(s._id || '');
  return /^[0-9a-f]{24}$/i.test(id) ? parseInt(id.slice(0, 8), 16) * 1000 : 0;
}

// Mỗi (lớp, ngày) chỉ một bản ghi có hiệu lực: bản sửa gần nhất. Dữ liệu cũ có thể có nhiều
// bản cho cùng lớp + ngày (sinh ra khi lớp đổi tên — tìm theo tên không thấy nên tạo thêm).
// Lấy "bản đầu tiên tìm thấy" thì kết quả phụ thuộc thứ tự trả về → lương admin và lương
// giảng viên tự xem có thể lệch nhau. PHẢI giống tienhanmega-fe/lib/teacherSchedule.ts.
// So hai bản ghi cùng (lớp, ngày): mốc sửa muộn hơn thắng; HOÀ thì _id lớn hơn thắng.
// Phải là thứ tự TOÀN PHẦN, không phụ thuộc thứ tự mảng đầu vào — backend lấy bản ghi
// không sort còn frontend nhận bản đã sort theo ngày, nên dùng `>=` (bản đứng sau thắng)
// sẽ cho hai bên chọn hai bản khác nhau và ra hai con số lương khác nhau.
function beats(a, b) {
  const ea = editedAt(a), eb = editedAt(b);
  if (ea !== eb) return ea > eb;
  return String(a._id || '') > String(b._id || '');
}

function latestPerClassDate(overrides, classes) {
  const best = new Map();
  for (const s of overrides) {
    const cls = classes.find((c) => belongsToClass(s, c));
    const key = `${cls ? cls._id : `name:${s.className}`}__${s.date}`;
    const cur = best.get(key);
    if (!cur || beats(s, cur)) best.set(key, s);
  }
  return [...best.values()];
}

function buildTeacherSessions(teacherId, classes, allOverrides, todayStr, { latestWins = true } = {}) {
  const overrides = latestWins ? latestPerClassDate(allOverrides, classes) : allOverrides;
  const result = [];
  classes.forEach((c) => {
    const segments = effectiveAssignments(c).filter((a) => String(a.teacherId) === String(teacherId));
    if (segments.length === 0) return;
    // Lớp có thể chạy nhiều khoá nối tiếp, mỗi khoá lịch riêng — xem utils/classPhase.js.
    const dates = scheduledDatesOfClass(c, todayStr).filter((d) => d <= todayStr);
    dates.forEach((date) => {
      const inSegment = segments.some((a) => date >= a.fromDate && (!a.toDate || date <= a.toDate));
      if (!inSegment) return;
      // Ngoại lệ nối với lớp theo classId (bản ghi cũ chưa có classId thì theo tên).
      // Lấy bản ghi của đúng (lớp, ngày) bất kể trạng thái: buổi 'taught' cũng có thể
      // mang payDate/paidRate/paidTeacherId mà sổ lương cần đọc.
      const override = overrides.find((s) => belongsToClass(s, c) && s.date === date);
      const paidId = override ? paidTeacherIdOf(override) : null;
      // Buổi đã chốt cho NGƯỜI KHÁC (dạy thay, hoặc admin gán tay) thì không còn là của
      // giảng viên này — pass thứ 2 bên dưới sẽ cộng cho đúng người.
      if (paidId && paidId !== String(teacherId)) return;
      // 'absent'/'not-taught' THẮNG mọi thứ: không ai dạy buổi này nên không sinh tiền,
      // kể cả khi bản ghi có chốt paidTeacherId. Vẫn phải mang theo `override` để pass 2
      // nhận ra buổi này đã xử lý rồi, nếu không nó sẽ cộng thêm một dòng "đã dạy".
      if (override && (override.status === 'absent' || override.status === 'not-taught')) {
        result.push({ date, classId: c._id, className: c.name, status: override.status, override });
        return;
      }
      // Buổi chốt đích danh cho CHÍNH giảng viên này là buổi họ đã dạy — 'substituted'
      // chỉ có nghĩa "người theo lịch không dạy", để nguyên sẽ bị bộ lọc của
      // buildTeacherLedger loại mất.
      const mine = paidId === String(teacherId);
      result.push({
        date, classId: c._id, className: c.name,
        status: !override || mine ? 'taught' : override.status,
        override: override || null,
      });
    });
  });

  // Buổi chốt đích danh cho giảng viên NÀY nhưng không nằm trong đoạn họ phụ trách
  // (dạy thay, hoặc buổi được gán tay sang họ) — cộng thẳng theo lớp+ngày của buổi gốc.
  overrides.forEach((s) => {
    if (paidTeacherIdOf(s) !== String(teacherId)) return;
    if (s.date > todayStr) return;
    const already = result.some((r) => r.override && String(r.override._id) === String(s._id));
    if (already) return;
    const cls = classes.find((c) => belongsToClass(s, c));
    result.push({
      date: s.date, classId: cls ? cls._id : s.classId || null,
      className: cls ? cls.name : s.className, status: 'taught',
      substituteForTeacherName: s.teacherName, substituteRate: s.substituteRate ?? null,
      override: s,
    });
  });

  return result;
}

// Sổ lương phẳng của 1 giáo viên: buổi dạy (đã nhân đơn giá/buổi) + thưởng/phạt
// + hoa hồng giới thiệu — mỗi dòng {date, className, amount, kind, note}.
function buildTeacherLedger({ teacherId, classes, overrides, bonuses, commissions, todayStr, latestWins = true }) {
  const items = [];

  buildTeacherSessions(teacherId, classes, overrides, todayStr, { latestWins })
    .filter((s) => s.status === 'taught' || s.status === 'rescheduled')
    .forEach((s) => {
      const cls = s.classId ? classes.find((c) => String(c._id) === String(s.classId)) : classes.find((c) => c.name === s.className);
      if (!cls) return;
      // Buổi này tính cho ai, bao nhiêu, vào kỳ nào — một nơi duy nhất (utils/sessionPay.js).
      const r = resolveSession(cls, s.override || { date: s.date }, teacherId);
      if (r.rate == null) return;
      // Khoá của buổi lấy theo NGÀY DẠY (s.date), không phải r.payDate: buổi dạy bù có
      // ngày tính lương rơi sang kỳ sau nhưng vẫn thuộc khoá của ngày nó được xếp lịch.
      const courseTitle = phaseAt(cls, s.date)?.courseTitle || cls.course || '';
      items.push({ className: s.className, courseTitle, date: r.payDate, amount: r.rate, kind: 'session', substituteForTeacherName: s.substituteForTeacherName, substituteRate: s.override?.substituteRate ?? s.substituteRate ?? null });
    });

  bonuses.forEach((b) => {
    items.push({
      className: b.className || '', date: b.date,
      amount: b.type === 'penalty' ? -b.amount : b.amount,
      kind: b.type, note: b.note || '',
    });
  });

  commissions.forEach((c) => {
    items.push({
      className: '', date: c.date, amount: c.amount, kind: 'commission',
      note: `Hoa hồng giới thiệu${c.referredStudentName ? ` — ${c.referredStudentName}` : ''}`,
    });
  });

  return items;
}

module.exports = {
  DEFAULT_PAY_PERIOD_START_DAY, todayDateStr, payPeriodLabel, payPeriodBounds, currentPayPeriodLabel,
  scheduledDates, buildTeacherSessions, buildTeacherLedger, latestPerClassDate, editedAt,
};
