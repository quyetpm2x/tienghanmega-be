// NGÀY ĐĂNG KÝ — một khái niệm DUY NHẤT cho cả hệ thống (trước đây tách làm hai: "ngày đăng
// ký" của gói và "ngày tạo hồ sơ" của học sinh, khiến hai màn hình hiện hai ngày khác nhau).
//
// Thứ tự lấy:
//   1. EnrollmentPackage.registeredAt — ngày admin nhập (chuỗi "YYYY-MM-DD", không múi giờ)
//   2. EnrollmentPackage.createdAt    — gói cũ chưa có ô ngày đăng ký
//   3. Student.createdAt              — học sinh chưa có gói nào
const dayOf = v => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

// Ngày đăng ký của MỘT gói.
const packageRegisteredOn = pkg => dayOf(pkg && pkg.registeredAt) || dayOf(pkg && pkg.createdAt);

// Mọi ngày đăng ký của học sinh, cũ → mới. Không có gói nào thì lấy ngày tạo hồ sơ.
function studentRegisteredDates(student, packages) {
  const list = (packages || (student && student.packages) || [])
    .map(packageRegisteredOn)
    .filter(Boolean)
    .sort();
  if (list.length) return list;
  const created = dayOf(student && student.createdAt);
  return created ? [created] : [];
}

// Ngày đăng ký ĐẦU TIÊN (dùng khi cần một ngày đại diện cho học sinh).
const firstRegisteredOn = (student, packages) => studentRegisteredDates(student, packages)[0] || '';
// Ngày đăng ký GẦN NHẤT (dùng để sắp xếp danh sách).
function latestRegisteredOn(student, packages) {
  const list = studentRegisteredDates(student, packages);
  return list[list.length - 1] || '';
}

module.exports = { dayOf, packageRegisteredOn, studentRegisteredDates, firstRegisteredOn, latestRegisteredOn };
