const { STATUS_PRIORITY } = require('./packageMath');
const { studentRegisteredDates, latestRegisteredOn } = require('./registeredDate');

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

// Bộ lọc "số gói đăng ký". Cú pháp: "2" = đúng 2 gói, "4+" = từ 4 gói trở lên.
// Để ở đây và cho cả studentIndexPipeline dùng chung: danh sách học sinh đi qua HAI đường
// lọc khác nhau (có phân trang / không), viết hai lần là mở đường cho chúng lệch nhau.
function matchesPackageCount(count, spec) {
  if (!spec || spec === 'all') return true;
  const raw = String(spec).trim();
  const atLeast = raw.endsWith('+');
  const want = parseInt(atLeast ? raw.slice(0, -1) : raw, 10);
  if (!Number.isFinite(want)) return true;   // tham số rác thì coi như không lọc
  return atLeast ? count >= want : count === want;
}

// Bộ lọc "ngày đăng ký" — đúng MỘT ngày. registeredAt là chuỗi "YYYY-MM-DD" do người nhập
// chọn (không phải mốc thời gian), nên so chuỗi trực tiếp, không đụng tới múi giờ.
// Học sinh khớp khi CÓ ÍT NHẤT MỘT gói đăng ký đúng ngày đó.
function matchesRegisteredOn(dates, day) {
  if (!day) return true;
  const want = String(day).slice(0, 10);
  return (dates || []).some(d => String(d || '').slice(0, 10) === want);
}

// Các bộ lọc phải tính ra mới biết (không truy vấn thẳng database được).
function applyDerivedFilters(rows, { courseTitle, tuitionStatus, studentStatus, account, accountedIds, packages, registeredAt } = {}) {
  return rows.filter(s => {
    if (tuitionStatus && s.summary?.tuitionStatus !== tuitionStatus) return false;
    if (studentStatus && s.status !== studentStatus) return false;
    if (courseTitle && !(s.enrollments || []).some(e => isActiveEnrollment(e) && e.courseTitle === courseTitle)) return false;
    if (account === 'has-account' && !accountedIds?.has(String(s._id))) return false;
    if (account === 'no-account' && accountedIds?.has(String(s._id))) return false;
    if (!matchesPackageCount((s.packages || []).length, packages)) return false;
    if (!matchesRegisteredOn(studentRegisteredDates(s, s.packages), registeredAt)) return false;
    return true;
  });
}

// Theo ngày bắt đầu; học sinh chưa có ngày luôn xuống cuối (cả hai chiều).
function sortStudents(rows, dir = 'desc') {
  return [...rows].sort((a, b) => {
    const da = latestRegisteredOn(a, a.packages), db = latestRegisteredOn(b, b.packages);
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

module.exports = {
  earliestStartOf, applyDerivedFilters, sortStudents, summarizeStudents,
  matchesPackageCount, matchesRegisteredOn,
};
