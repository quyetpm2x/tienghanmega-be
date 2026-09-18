const { scheduledDatesOfClass } = require('./classPhase');
const { isValidClassDate } = require('./classDate');
const { resolveSession, paidTeacherIdOf } = require('./sessionPay');
const { teacherIdOnDate } = require('./classAssignment');
const { belongsToClass } = require('./classLink');
const { payPeriodLabel, DEFAULT_PAY_PERIOD_START_DAY } = require('./teacherLedger');

// So lịch CŨ với lịch MỚI trước khi lưu khoá học của lớp, để admin thấy hết hậu quả và
// ĐỊNH ĐOẠT từng bản ghi rơi ra ngoài lịch. Không có lựa chọn "để nguyên": nếu để nguyên,
// buổi dạy và điểm danh đó thành mồ côi — nằm trong DB nhưng không được tính vào đâu.
// Xem utils/classDate.js cho định nghĩa "ngày hợp lệ".
const NO_MONEY = new Set(['absent', 'not-taught']);

function diffPhases({ cls, nextPhases, sessions = [], attendances = [], payments = [], today, startDay = DEFAULT_PAY_PERIOD_START_DAY }) {
  const after = { ...cls, phases: nextPhases };
  // Chốt tới ngày xa nhất của cả hai bên để không bỏ sót ngày ở đuôi lịch còn mở.
  const until = [today, cls.endDate, ...(nextPhases || []).map(p => p.toDate)].filter(Boolean).sort().pop();
  const before = scheduledDatesOfClass(cls, until);
  const afterDates = scheduledDatesOfClass(after, until);
  const afterSet = new Set(afterDates);
  const beforeSet = new Set(before);

  const lostDates = before.filter(d => !afterSet.has(d));
  const gainedDates = afterDates.filter(d => !beforeSet.has(d));

  // Bản ghi CŨ có thể nối với lớp theo TÊN (classId null, dữ liệu trước backfill-class-ids).
  // So bằng classId thuần sẽ bỏ sót chúng — mọi nơi khác trong hệ thống vẫn nhận chúng là
  // của lớp này và vẫn trả tiền, nên bỏ sót nghĩa là lưu xong vẫn còn mồ côi.
  const mySessions = sessions.filter(r => belongsToClass(r, cls));
  const myAttendances = attendances.filter(r => belongsToClass(r, cls));

  // Một lớp một ngày chỉ được một buổi (StudentAttendance có unique index (classId, date),
  // TeacherSession upsert theo cùng cặp đó) — chỗ trống là ngày trong lịch MỚI chưa có
  // bản ghi nào. KHÔNG giới hạn ở gainedDates: rút ngắn khoá cho gainedDates rỗng, admin
  // sẽ chỉ còn mỗi lựa chọn xoá một buổi đã dạy thật.
  const taken = new Set([...mySessions, ...myAttendances].map(r => r.date));
  const freeDates = afterDates.filter(d => !taken.has(d));
  const byProximity = date => [...freeDates]
    .sort((a, b) => Math.abs(Date.parse(a) - Date.parse(date)) - Math.abs(Date.parse(b) - Date.parse(date)));

  const orphans = [];
  for (const s of mySessions) {
    if (isValidClassDate(after, s, 'session')) continue;
    const r = resolveSession(cls, s, teacherIdOnDate(cls, s.date));
    const earns = !NO_MONEY.has(s.status);
    orphans.push({
      kind: 'session', id: String(s._id), date: s.date, status: s.status || 'taught',
      teacherName: s.paidTeacherName || s.substituteTeacherName || s.teacherName || '',
      // Buổi nghỉ / không dạy không sinh tiền — hiện đơn giá ở đây làm admin tưởng mất tiền.
      amount: earns ? (r.rate || 0) : 0,
      period: earns ? payPeriodLabel(r.payDate, startDay) : '',
      suggestions: byProximity(s.date),
    });
  }
  for (const a of myAttendances) {
    if (isValidClassDate(after, a, 'attendance')) continue;
    orphans.push({
      kind: 'attendance', id: String(a._id), date: a.date, status: '',
      teacherName: '', amount: 0, period: '',
      suggestions: byProximity(a.date),
    });
  }

  // Kỳ lương bị chạm. Phải duyệt HỢP của hai lịch, không chỉ ngày thêm/mất: đổi đơn giá
  // hay đổi người dạy mà giữ nguyên ngày cũng làm lương đổi, và đó chính là thao tác dễ
  // xảy ra nhất. Chỉ nhìn ngày thêm/mất thì thay đổi đó lọt qua hoàn toàn im lặng.
  const recordOn = new Map(mySessions.map(r => [r.date, r]));
  const contribution = (c, date) => {
    const rec = recordOn.get(date);
    if (rec && NO_MONEY.has(rec.status)) return null;   // không ai được trả tiền buổi này
    const original = teacherIdOnDate(c, date);
    const r = resolveSession(c, rec || { date }, original);
    if (r.teacherId == null || r.rate == null) return null;
    return { period: payPeriodLabel(r.payDate, startDay), amount: r.rate };
  };

  const periodMap = new Map();
  const bump = (label, key, amount) => {
    const cur = periodMap.get(label) || { label, before: 0, after: 0 };
    cur[key] += amount;
    periodMap.set(label, cur);
  };
  for (const d of new Set([...before, ...afterDates])) {
    if (beforeSet.has(d)) { const c = contribution(cls, d); if (c) bump(c.period, 'before', c.amount); }
    if (afterSet.has(d)) { const c = contribution(after, d); if (c) bump(c.period, 'after', c.amount); }
  }

  // Badge "đã trả"/"đã kiểm" phải nói về giảng viên CỦA LỚP NÀY. Gom mọi khoản trả của mọi
  // giảng viên rồi lấy đại một bản ghi cho mỗi kỳ thì badge thành "có ai đó đã được trả
  // kỳ này", vô nghĩa với lớp đang sửa.
  const teacherIds = new Set([...(cls.phases || []), ...(nextPhases || [])]
    .flatMap(p => (p.teachers || []).map(a => String(a.teacherId || '')))
    .filter(Boolean));
  if (cls.teacherId) teacherIds.add(String(cls.teacherId));
  for (const a of (cls.teacherAssignments || [])) if (a.teacherId) teacherIds.add(String(a.teacherId));

  const mine = payments.filter(p => teacherIds.has(String(p.teacherId)));
  const periods = [...periodMap.values()]
    .map(p => {
      const forPeriod = mine.filter(x => String(x.periodStart || '').slice(0, 7) === p.label);
      return {
        ...p, diff: p.after - p.before,
        paid: forPeriod.length > 0,
        verified: forPeriod.some(x => x.verified),
      };
    })
    .filter(p => p.diff !== 0)   // kỳ không đổi đồng nào thì không phải cảnh báo
    .sort((a, b) => a.label.localeCompare(b.label));

  return { lostDates, gainedDates, orphans, periods, freeDates, teacherIds: [...teacherIds] };
}

module.exports = { diffPhases };
