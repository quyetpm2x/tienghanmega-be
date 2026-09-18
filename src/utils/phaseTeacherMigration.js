const { effectiveAssignments } = require('./classAssignment');
const { rateAt } = require('./classRate');

// Dựng phases[].teachers cho MỘT giai đoạn từ mô hình cũ (teacherAssignments + rateHistory).
//
// Nguyên tắc: cắt theo HỢP CỦA MỌI MỐC NGÀY — biên giai đoạn, biên phân công giảng viên, và
// ngày đổi lương. Nhờ vậy mỗi đoạn sinh ra có đúng MỘT giảng viên và đúng MỘT mức lương suốt
// khoảng của nó, nên lương tính ra sau di trú bằng đúng trước di trú. Cắt thô hơn (chỉ theo
// biên phân công) sẽ làm mất các lần đổi lương giữa chừng.
const MAX = '9999-12-31';

function addDays(dateStr, delta) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function teachersOfPhase(cls, phase) {
  // rateAt phải đọc theo MÔ HÌNH CŨ trong lúc di trú — để nguyên cls thì nhánh phases mới
  // sẽ thắng và ta đọc lại chính thứ đang ghi ra.
  const legacy = { ...cls, phases: [] };
  const assignments = effectiveAssignments(legacy);
  const pTo = phase.toDate || MAX;

  const marks = new Set([phase.fromDate]);
  for (const a of assignments) {
    if (a.fromDate > phase.fromDate && a.fromDate <= pTo) marks.add(a.fromDate);
    if (a.toDate && a.toDate >= phase.fromDate && a.toDate < pTo) marks.add(addDays(a.toDate, 1));
  }
  for (const r of (cls.rateHistory || [])) {
    if (r.fromDate > phase.fromDate && r.fromDate <= pTo) marks.add(r.fromDate);
    if (r.toDate && r.toDate >= phase.fromDate && r.toDate < pTo) marks.add(addDays(r.toDate, 1));
  }

  const starts = [...marks].sort();
  const out = [];
  starts.forEach((from, i) => {
    const to = i + 1 < starts.length ? addDays(starts[i + 1], -1) : (phase.toDate || null);
    const seg = assignments.find(a => from >= a.fromDate && (!a.toDate || from <= a.toDate));
    if (!seg) return;   // khoảng không ai phụ trách — giữ hở, đúng thực tế
    const rate = rateAt(legacy, from, seg.teacherId);
    out.push({
      teacherId: seg.teacherId || null, teacherName: seg.teacherName || '',
      fromDate: from, toDate: to,
      rate: rate === cls.ratePerSession ? null : rate,
    });
  });

  // Cắt theo hợp mốc hay tạo ra đoạn thừa — gộp hai đoạn liền nhau cùng người cùng giá.
  return out.reduce((acc, seg) => {
    const last = acc[acc.length - 1];
    if (last && String(last.teacherId) === String(seg.teacherId) && last.rate === seg.rate
      && last.toDate && addDays(last.toDate, 1) === seg.fromDate) {
      last.toDate = seg.toDate;
      return acc;
    }
    acc.push(seg);
    return acc;
  }, []);
}

module.exports = { teachersOfPhase, addDays };
