const { buildTeacherLedger, payPeriodLabel } = require('./teacherLedger');

// Chênh lệch LƯƠNG BUỔI DẠY (theo đúng công thức tính lương của hệ thống) giữa hai trạng thái
// dữ liệu buổi dạy — dùng để báo trước ảnh hưởng của việc gắn classId cho dữ liệu cũ. Chỉ tính
// phần buổi dạy; thưởng/phạt/hoa hồng không đổi nên không đưa vào.
function sessionTotalsByPeriod({ teacherId, classes, sessions, startDay, todayStr, latestWins = true }) {
  const totals = new Map();
  for (const item of buildTeacherLedger({ teacherId, classes, overrides: sessions, bonuses: [], commissions: [], todayStr, latestWins })) {
    if (item.kind !== 'session') continue;
    const label = payPeriodLabel(item.date, startDay);
    const t = totals.get(label) || { amount: 0, count: 0 };
    t.amount += item.amount; t.count += 1;
    totals.set(label, t);
  }
  return totals;
}

// latestWinsBefore=false: trạng thái "trước" tính theo cách cũ (lấy bản ghi đầu tiên) — dùng khi
// báo cáo ảnh hưởng của việc chuyển sang quy tắc "bản sửa gần nhất".
function payrollImpactByPeriod({ teachers, classes, sessionsBefore, sessionsAfter, startDay, todayStr, payments = [], latestWinsBefore = true }) {
  const paidOf = (teacherId, period) => payments
    .filter(p => String(p.teacherId) === String(teacherId) && payPeriodLabel(p.periodStart, startDay) === period)
    .reduce((s, p) => s + (p.amountPaid || 0), 0);
  const rows = [];
  for (const t of teachers) {
    const before = sessionTotalsByPeriod({ teacherId: t._id, classes, sessions: sessionsBefore, startDay, todayStr, latestWins: latestWinsBefore });
    const after = sessionTotalsByPeriod({ teacherId: t._id, classes, sessions: sessionsAfter, startDay, todayStr });
    for (const period of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const b = before.get(period) || { amount: 0, count: 0 };
      const a = after.get(period) || { amount: 0, count: 0 };
      if (b.amount === a.amount && b.count === a.count) continue;
      rows.push({
        teacherId: String(t._id), teacherName: t.name, period,
        before: b.amount, after: a.amount, diff: a.amount - b.amount,
        sessionsBefore: b.count, sessionsAfter: a.count, paid: paidOf(t._id, period),
      });
    }
  }
  return rows;
}

// Bản sao danh sách buổi dạy sau khi áp các cập nhật gắn classId của kế hoạch.
function applyLinkUpdates(sessions, updates) {
  const byId = new Map(updates.map(u => [String(u._id), u]));
  return sessions.map(s => {
    const u = byId.get(String(s._id));
    return u ? { ...s, classId: u.classId, className: u.className } : s;
  });
}

module.exports = { payrollImpactByPeriod, applyLinkUpdates };
