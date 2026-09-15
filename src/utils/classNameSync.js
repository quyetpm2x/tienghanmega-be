// Lớp ở trang Lớp học là GỐC; mọi bản ghi nối với lớp theo classId. Kế hoạch (thuần, không
// chạm database) để bổ sung classId + đưa tên hiển thị về tên hiện tại cho điểm danh học
// sinh, buổi dạy giảng viên, thưởng/phạt, ghi danh. Bản ghi chưa có classId được gắn:
//  • sameName — tên trên bản ghi trùng tên một lớp đang tồn tại;
//  • oldName  — tên cũ của lớp đã đổi tên, suy từ học sinh (Student.classId là liên kết thật,
//               Student.className là bản sao tên lúc xếp lớp, không đổi theo khi lớp đổi tên).
// Bản ghi đã có classId mà tên lệch: nameDrift (chỉ sửa tên hiển thị).
function buildClassLinkPlan({ classes, students, enrollments, attendances, sessions, bonuses }) {
  const classById = new Map(classes.map(c => [String(c._id), c]));
  const classByName = new Map(classes.map(c => [c.name, c]));

  const aliasTargets = new Map();
  for (const s of students) {
    const cls = s.classId ? classById.get(String(s.classId)) : null;
    if (!cls || !s.className || s.className === cls.name || classByName.has(s.className)) continue;
    if (!aliasTargets.has(s.className)) aliasTargets.set(s.className, new Set());
    aliasTargets.get(s.className).add(String(cls._id));
  }

  const unknown = new Map();
  const bump = (name, key) => {
    if (aliasTargets.has(name)) return; // mơ hồ — đã báo riêng
    if (!unknown.has(name)) unknown.set(name, { name, attendances: 0, sessions: 0, bonuses: 0 });
    unknown.get(name)[key] += 1;
  };

  // Lớp gốc cho một bản ghi + lý do. null = không xác định được.
  function target(record) {
    if (record.classId) {
      const cls = classById.get(String(record.classId));
      if (!cls) return null;
      return { cls, reason: record.className === cls.name ? 'linked' : 'nameDrift' };
    }
    const same = classByName.get(record.className);
    if (same) return { cls: same, reason: 'sameName' };
    const set = aliasTargets.get(record.className);
    if (set && set.size === 1) return { cls: classById.get([...set][0]), reason: 'oldName' };
    return null;
  }
  const updateOf = (r, t) => ({ _id: String(r._id), classId: String(t.cls._id), className: t.cls.name, from: r.className, reason: t.reason });

  // Điểm danh: mỗi lớp mỗi ngày một buổi — gắn mà trùng ngày với buổi đã thuộc lớp đó thì
  // không gắn, báo xung đột để admin gộp tay.
  const takenDates = new Set();
  for (const a of attendances) {
    const t = target(a);
    if (t && (t.reason === 'linked' || t.reason === 'nameDrift' || t.reason === 'sameName')) takenDates.add(`${t.cls._id}__${a.date}`);
  }
  const attendanceUpdates = [];
  const conflicts = [];
  for (const a of attendances) {
    const t = target(a);
    if (!t) { bump(a.className, 'attendances'); continue; }
    if (t.reason === 'linked') continue;
    if (t.reason === 'oldName') {
      const key = `${t.cls._id}__${a.date}`;
      if (takenDates.has(key)) { conflicts.push({ attendanceId: String(a._id), from: a.className, to: t.cls.name, date: a.date }); continue; }
      takenDates.add(key);
    }
    attendanceUpdates.push(updateOf(a, t));
  }

  const sessionUpdates = [];
  const payrollImpact = [];
  for (const s of sessions) {
    const t = target(s);
    if (!t) { bump(s.className, 'sessions'); continue; }
    if (t.reason === 'linked') continue;
    sessionUpdates.push(updateOf(s, t));
    // Chỉ buổi đang mang tên cũ (không khớp lớp nào) mới đổi kết quả tính lương sau khi gắn.
    if (t.reason === 'oldName') {
      payrollImpact.push({ _id: String(s._id), from: s.className, to: t.cls.name, date: s.date, status: s.status, teacherName: s.teacherName });
    }
  }

  const bonusUpdates = [];
  for (const b of bonuses) {
    if (!b.classId && !b.className) continue;
    const t = target(b);
    if (!t) { bump(b.className, 'bonuses'); continue; }
    if (t.reason === 'linked') continue;
    bonusUpdates.push(updateOf(b, t));
  }

  const enrollmentUpdates = enrollments
    .map(e => ({ e, cls: e.classId ? classById.get(String(e.classId)) : null }))
    .filter(({ e, cls }) => cls && e.className !== cls.name)
    .map(({ e, cls }) => ({ _id: String(e._id), classId: String(cls._id), className: cls.name, from: e.className, reason: 'nameDrift' }));

  const ambiguous = [...aliasTargets.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, classNames: [...set].map(id => classById.get(id).name) }));

  return {
    attendanceUpdates, sessionUpdates, bonusUpdates, enrollmentUpdates,
    payrollImpact, conflicts, ambiguous, unknown: [...unknown.values()],
  };
}

// Lệnh bulkWrite cho một kế hoạch nối lớp. Chỉ ghi nếu tên trên bản ghi vẫn như lúc lập (có ai
// vừa sửa thì bỏ qua, lần chạy sau sẽ tính lại). timestamps: false — nối lớp không phải "sửa buổi
// dạy": nếu để Mongoose đè updatedAt, mọi bản ghi mang cùng một giờ sửa và mất thứ tự sửa thật.
function classLinkBulkOps(updates) {
  return updates.map(u => ({
    updateOne: {
      filter: { _id: u._id, className: u.from },
      update: { $set: { classId: u.classId, className: u.className } },
      timestamps: false,
    },
  }));
}

module.exports = { buildClassLinkPlan, classLinkBulkOps };
