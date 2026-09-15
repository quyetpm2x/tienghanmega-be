// Sổ lương phẳng + quy đổi "kỳ lương" cho 1 giáo viên — bản Node của
// tienhanmega-fe/lib/teacherSchedule.ts + lib/teacherSalary.ts, dùng riêng cho
// endpoint /teacher-portal/salary (tienh viên chỉ nhận số tiền cuối cùng, không
// lộ ratePerSession/dữ liệu giáo viên khác qua network). Phải giữ đúng cùng công
// thức "kỳ lương" (payPeriodLabel/Bounds) với bản admin để 2 bên luôn khớp số.

const { belongsToClass } = require('./classLink');

const DEFAULT_PAY_PERIOD_START_DAY = 10;

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDateLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    if (selected.has(cur.getDay())) dates.push(fmtDateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Lớp cũ chưa từng qua 1 lần đổi giáo viên nào sẽ có teacherAssignments rỗng —
// coi như 1 đoạn duy nhất gán cho giáo viên hiện tại từ ngày khai giảng.
function effectiveAssignments(c) {
  if (Array.isArray(c.teacherAssignments) && c.teacherAssignments.length > 0) return c.teacherAssignments;
  if (!c.teacherId) return [];
  return [{ teacherId: c.teacherId, teacherName: c.teacher, fromDate: c.startDate || '', toDate: null }];
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
function latestPerClassDate(overrides, classes) {
  const best = new Map();
  for (const s of overrides) {
    const cls = classes.find((c) => belongsToClass(s, c));
    const key = `${cls ? cls._id : `name:${s.className}`}__${s.date}`;
    const cur = best.get(key);
    if (!cur || editedAt(s) >= editedAt(cur)) best.set(key, s);
  }
  return [...best.values()];
}

function buildTeacherSessions(teacherId, classes, allOverrides, todayStr, { latestWins = true } = {}) {
  const overrides = latestWins ? latestPerClassDate(allOverrides, classes) : allOverrides;
  const result = [];
  classes.forEach((c) => {
    const segments = effectiveAssignments(c).filter((a) => String(a.teacherId) === String(teacherId));
    if (segments.length === 0) return;
    const dates = scheduledDates(c.startDate, c.endDate || todayStr, c.days || '').filter((d) => d <= todayStr);
    dates.forEach((date) => {
      const inSegment = segments.some((a) => date >= a.fromDate && (!a.toDate || date <= a.toDate));
      if (!inSegment) return;
      // Ngoại lệ nối với lớp theo classId (bản ghi cũ chưa có classId thì theo tên).
      const override = overrides.find((s) => belongsToClass(s, c) && s.date === date &&
        (s.status === 'absent' || s.status === 'rescheduled' || s.status === 'not-taught' || s.status === 'substituted'));
      if (override) { result.push({ date, classId: c._id, className: c.name, status: override.status }); return; }
      result.push({ date, classId: c._id, className: c.name, status: 'taught' });
    });
  });

  // Buổi giáo viên NÀY dạy THAY cho người khác — không cần nằm trong lịch/lớp họ
  // đang phụ trách, cộng thẳng thành buổi "đã dạy" theo đúng lớp+ngày của buổi gốc.
  overrides.forEach((s) => {
    if (s.status === 'substituted' && String(s.substituteTeacherId || '') === String(teacherId) && s.date <= todayStr) {
      const cls = classes.find((c) => belongsToClass(s, c));
      result.push({ date: s.date, classId: cls ? cls._id : s.classId || null, className: cls ? cls.name : s.className, status: 'taught', substituteForTeacherName: s.teacherName, substituteRate: s.substituteRate ?? null });
    }
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
      const amount = s.substituteRate ?? cls?.ratePerSession;
      if (!cls || amount == null) return;
      items.push({ className: s.className, date: s.date, amount, kind: 'session', substituteForTeacherName: s.substituteForTeacherName, substituteRate: s.substituteRate ?? null });
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
