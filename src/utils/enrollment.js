const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const EnrollmentPackage = require('../models/EnrollmentPackage');
const Payment = require('../models/Payment');
const { paymentState, summarizePackages, deriveStudentStatus, normalizeEnrollmentStatus } = require('./packageMath');
const { firstRegisteredOn } = require('./registeredDate');

// Nơi DUY NHẤT trả lời "học sinh của lớp" và "các lớp của học sinh". Trước đây mỗi
// controller tự truy Student.className hoặc Student.classId (hai khoá có thể lệch
// nhau) và đếm cả học sinh đã nghỉ. Quy tắc chung: chỉ ghi danh status 'active',
// join bằng classId.
const toId = v => new mongoose.Types.ObjectId(String(v));

function activeClassIdsOfStudent(studentId) {
  return Enrollment.distinct('classId', { studentId, status: 'active', classId: { $ne: null } });
}

async function isActiveInClass(studentId, classId) {
  if (!classId) return false;
  return !!(await Enrollment.exists({ studentId, classId, status: 'active' }));
}

function activeStudentIdsOfClass(classId) {
  return Enrollment.distinct('studentId', { classId, status: 'active' });
}

function activeStudentIdsOfClasses(classIds) {
  return Enrollment.distinct('studentId', { classId: { $in: classIds }, status: 'active' });
}

// Sĩ số đếm NGƯỜI, không đếm ghi danh — một học sinh có hai ghi danh cùng lớp (không
// nên xảy ra, service đã chặn) vẫn chỉ tính một.
async function activeStudentCountsByClass(classIds) {
  if (!classIds.length) return {};
  const rows = await Enrollment.aggregate([
    { $match: { classId: { $in: classIds.map(toId) }, status: 'active' } },
    { $group: { _id: '$classId', students: { $addToSet: '$studentId' } } },
  ]);
  return Object.fromEntries(rows.map(r => [String(r._id), r.students.length]));
}

async function activeClassesByStudent(studentIds, { classIds } = {}) {
  const filter = { studentId: { $in: studentIds }, status: 'active' };
  if (classIds) filter.classId = { $in: classIds };
  const rows = await Enrollment.find(filter).select('studentId classId className').lean();
  const map = new Map();
  for (const r of rows) {
    const key = String(r.studentId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ classId: r.classId, className: r.className });
  }
  return map;
}

async function packagesWithState(studentIds) {
  const packages = await EnrollmentPackage.find({ studentId: { $in: studentIds } })
    .select('-legacy').sort({ createdAt: 1 }).lean();
  const pkgIds = packages.map(p => p._id);
  const [enrollments, sums] = await Promise.all([
    Enrollment.find({ packageId: { $in: pkgIds } }).sort({ createdAt: 1 }).lean(),
    Payment.aggregate([
      { $match: { packageId: { $in: pkgIds } } },
      { $group: { _id: '$packageId', total: { $sum: '$amount' }, firstPaidAt: { $min: '$paidAt' } } },
    ]),
  ]);
  const enrByPkg = new Map();
  for (const e of enrollments) {
    // Hiển thị theo quy tắc hiện hành: khoá "đang học" mà chưa có lớp là "chưa xếp lớp"
    // (dữ liệu tạo trước khi có trạng thái này). Chỉ đổi bản trả về, không ghi database.
    e.status = normalizeEnrollmentStatus(e.status, !!e.classId);
    const k = String(e.packageId);
    if (!enrByPkg.has(k)) enrByPkg.set(k, []);
    enrByPkg.get(k).push(e);
  }
  const sumByPkg = new Map(sums.map(s => [String(s._id), s.total]));
  const firstPaidByPkg = new Map(sums.map(s => [String(s._id), s.firstPaidAt]));

  const byStudent = new Map();
  for (const p of packages) {
    const paymentsTotal = sumByPkg.get(String(p._id)) || 0;
    const view = {
      ...p,
      enrollments: enrByPkg.get(String(p._id)) || [],
      paymentsTotal,
      // Ngày của khoản thu sớm nhất (null = chưa có khoản thu, VD tiền cũ nhập tay).
      firstPaidAt: firstPaidByPkg.get(String(p._id)) || null,
      ...paymentState({ netTotal: p.netTotal, paymentsTotal, paidAdjustment: p.paidAdjustment }),
    };
    const k = String(p.studentId);
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k).push(view);
  }
  return byStudent;
}

async function attachPackages(students) {
  const byStudent = await packagesWithState(students.map(s => s._id));
  return students.map(s => {
    const packages = byStudent.get(String(s._id)) || [];
    const enrollments = packages.flatMap(p => p.enrollments);
    const paidRawTotal = packages.reduce((sum, p) => sum + Math.max(p.paidRaw || 0, 0), 0);
    // Khoản thu sớm nhất. Tiền cũ nhập tay không có Payment nào → lấy NGÀY ĐĂNG KÝ làm
    // ngày ước tính (admin nhập tiền cọc ngay lúc đăng ký), cùng quy tắc với lịch sử thanh
    // toán ở controllers/studentController.js — xem utils/registeredDate.js.
    const realFirstPaidAt = packages.map(p => p.firstPaidAt).filter(Boolean).sort((a, b) => a - b)[0] || null;
    const estimatedFirstPaidAt = !realFirstPaidAt && paidRawTotal > 0
      ? (firstRegisteredOn(s, packages) || null) : null;
    return {
      ...s,
      // Trạng thái hiển thị luôn suy từ các khoá (bản lưu trên Student chỉ là bộ đệm để đếm/lọc).
      status: deriveStudentStatus(enrollments.map(e => e.status)) || s.status,
      statusManual: false,
      packages,
      enrollments,
      summary: {
        ...summarizePackages(packages),
        // Số thực đã nộp (kể cả vượt học phí) và phần nộp dư — để HIỂN THỊ; mọi tính toán
        // doanh thu/công nợ vẫn dùng paid/debt đã kẹp tối đa bằng học phí.
        paidRaw: paidRawTotal,
        overpaid: packages.reduce((s, p) => s + Math.max((p.paidRaw || 0) - (p.netTotal || 0), 0), 0),
        firstPaidAt: realFirstPaidAt || estimatedFirstPaidAt,
        firstPaidEstimated: !!estimatedFirstPaidAt,
      },
    };
  });
}

module.exports = {
  activeClassIdsOfStudent, isActiveInClass, activeStudentIdsOfClass, activeStudentIdsOfClasses,
  activeStudentCountsByClass, activeClassesByStudent, packagesWithState, attachPackages,
};
