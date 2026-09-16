const { STATUS_PRIORITY } = require('./packageMath');

// Lọc / sắp xếp / thống kê danh sách học sinh ĐÃ gắn gói (attachPackages). Tách riêng khỏi
// controller để phân trang ở backend vẫn giữ đúng ý nghĩa các bộ lọc mà giao diện đang dùng.

// Ngày bắt đầu của học sinh = ngày sớm nhất trong các khoá.
function earliestStartOf(s) {
  return (s.enrollments || [])
    .map(e => (e.startDate || '').slice(0, 10))
    .filter(Boolean)
    .sort()[0] || '';
}

const isActiveEnrollment = e => e.status === 'active' || e.status === 'unassigned';

// Các bộ lọc phải tính ra mới biết (không truy vấn thẳng database được).
function applyDerivedFilters(rows, { courseTitle, tuitionStatus, studentStatus, account, accountedIds } = {}) {
  return rows.filter(s => {
    if (tuitionStatus && s.summary?.tuitionStatus !== tuitionStatus) return false;
    if (studentStatus && s.status !== studentStatus) return false;
    if (courseTitle && !(s.enrollments || []).some(e => isActiveEnrollment(e) && e.courseTitle === courseTitle)) return false;
    if (account === 'has-account' && !accountedIds?.has(String(s._id))) return false;
    if (account === 'no-account' && accountedIds?.has(String(s._id))) return false;
    return true;
  });
}

// Theo ngày bắt đầu; học sinh chưa có ngày luôn xuống cuối (cả hai chiều).
function sortStudents(rows, dir = 'desc') {
  return [...rows].sort((a, b) => {
    const da = earliestStartOf(a), db = earliestStartOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return dir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
  });
}

function summarizeStudents(rows) {
  const byStatus = Object.fromEntries(STATUS_PRIORITY.map(st => [st, 0]));
  let paid = 0, partial = 0, unpaid = 0;
  for (const s of rows) {
    const ts = s.summary?.tuitionStatus;
    if (ts === 'paid') paid++;
    else if (ts === 'partial') partial++;
    else unpaid++;
    if (s.status in byStatus) byStatus[s.status]++;
  }
  return { total: rows.length, paid, partial, unpaid, byStatus };
}

module.exports = { earliestStartOf, applyDerivedFilters, sortStudents, summarizeStudents };
