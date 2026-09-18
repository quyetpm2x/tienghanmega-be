// Lịch sử phân công giáo viên của một lớp. Lớp cũ chưa từng đổi giáo viên có
// teacherAssignments rỗng — coi như một đoạn duy nhất gán cho giáo viên hiện tại
// từ ngày khai giảng. PHẢI giữ cùng quy tắc với tienhanmega-fe/lib/classAssignment.ts.
function effectiveAssignments(c) {
  // Mô hình MỚI: giảng viên nằm trong từng khoá. Trải phẳng theo thứ tự ngày.
  const fromPhases = (c?.phases || []).flatMap(p => (p.teachers || []).map(a => ({
    teacherId: a.teacherId, teacherName: a.teacherName,
    fromDate: a.fromDate, toDate: a.toDate ?? null,
  })));
  if (fromPhases.length) return fromPhases.sort((x, y) => x.fromDate.localeCompare(y.fromDate));
  // Lớp chưa di trú (hoặc khoá chưa khai giảng viên): mảng phẳng cấp lớp như trước.
  if (Array.isArray(c?.teacherAssignments) && c.teacherAssignments.length > 0) return c.teacherAssignments;
  if (!c?.teacherId) return [];
  return [{ teacherId: c.teacherId, teacherName: c.teacher, fromDate: c.startDate || '', toDate: null }];
}

// Ai phụ trách lớp ĐÚNG VÀO một ngày cụ thể. null nếu ngày đó không thuộc đoạn nào
// (trước ngày khai giảng, hoặc khoảng trống giữa hai giáo viên).
function teacherIdOnDate(c, date) {
  const seg = effectiveAssignments(c).find(a => date >= a.fromDate && (!a.toDate || date <= a.toDate));
  return seg ? (seg.teacherId ?? null) : null;
}

module.exports = { effectiveAssignments, teacherIdOnDate };
