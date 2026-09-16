// Gộp các dòng khoản thu theo HỌC SINH — 1 học sinh 1 dòng, chi tiết từng lần đóng (kể cả
// đóng cho lớp khác và phần điều chỉnh tay) nằm trong `items`. Gộp ở backend chứ không ở giao
// diện vì bảng phân trang ở backend: gộp sau khi cắt trang sẽ tách đôi cùng một học sinh.
const sortKey = r => r.date || r.closeDate || '';

function groupPaymentsByStudent(rows) {
  const byStudent = new Map();
  for (const r of rows) {
    const key = String(r.studentId || `name:${r.studentName}`);
    if (!byStudent.has(key)) {
      byStudent.set(key, {
        _id: `stu-${key}`,
        studentId: r.studentId ? String(r.studentId) : null,
        studentName: r.studentName,
        classNames: [], courseCategories: [],
        amount: 0, count: 0,
        date: null, dateEstimated: false, closeDate: null,
        hasManual: false,
        items: [],
      });
    }
    const g = byStudent.get(key);
    if (r.className && !g.classNames.includes(r.className)) g.classNames.push(r.className);
    if (r.courseCategory && !g.courseCategories.includes(r.courseCategory)) g.courseCategories.push(r.courseCategory);
    g.amount += r.amount || 0;
    g.count += 1;
    // Ngày của dòng gộp = lần đóng mới nhất; cờ ước tính đi theo đúng dòng được chọn.
    if (r.date && (!g.date || r.date > g.date)) { g.date = r.date; g.dateEstimated = !!r.dateEstimated; }
    if (r.closeDate && (!g.closeDate || r.closeDate > g.closeDate)) g.closeDate = r.closeDate;
    if (r.kind === 'manual') g.hasManual = true;
    g.items.push(r);
  }
  const groups = [...byStudent.values()];
  for (const g of groups) g.items.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return groups.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

module.exports = { groupPaymentsByStudent };
