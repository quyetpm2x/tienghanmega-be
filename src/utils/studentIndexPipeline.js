const { STATUS_PRIORITY } = require('./packageMath');

// "Chỉ mục" học sinh để LỌC / SẮP XẾP / PHÂN TRANG mà không phải dựng dữ liệu đầy đủ.
//
// Cách làm: hai lệnh aggregate GỘP SẴN theo học sinh (tiền, ghi danh) — database trả về mỗi
// học sinh một dòng nhỏ thay vì toàn bộ gói/ghi danh/khoản thu. Node chỉ ghép lại, lọc, sắp
// xếp, cắt trang, rồi mới dựng dữ liệu đầy đủ cho đúng số học sinh của trang đó.
//
// Kết quả phải khớp từng chữ với utils/packageMath.js:
//   • mỗi gói: đã nộp = kẹp(Σ khoản thu + sửa tay, 0 … học phí gói)
//   • học sinh: "đã đóng đủ" khi CÓ gói và MỌI gói đã đủ; "đóng một phần" khi có gói nào đã
//     nộp > 0; còn lại "chưa đóng"
//   • trạng thái học: khoá 'active'/'unassigned' quy về có lớp hay chưa, rồi lấy theo
//     STATUS_PRIORITY; không có khoá nào thì giữ trạng thái lưu trên hồ sơ
const ACTIVE_ENROLLMENT_STATUSES = ['active', 'unassigned'];
const MISSING_DATE_LAST = '9999-99-99';   // chưa có ngày bắt đầu → luôn xuống cuối

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tổng khoản thu của từng gói — MỘT lượt quét bảng khoản thu (không tra riêng từng gói).
function paymentTotalsPipeline(packageIds) {
  return [
    ...(packageIds ? [{ $match: { packageId: { $in: packageIds } } }] : []),
    { $group: { _id: '$packageId', total: { $sum: '$amount' } } },
  ];
}

// TẤT CẢ dữ liệu cần cho chỉ mục trong MỘT lượt gọi database ($unionWith): học sinh, gói,
// tổng khoản thu theo gói, ghi danh đã gộp. Mỗi vòng gọi Atlas tốn cả trăm mili-giây nên gộp
// 4 lượt thành 1 là phần tiết kiệm lớn nhất.
function studentIndexUnionPipeline({ studentIds } = {}) {
  const pkgMatch = studentIds ? [{ $match: { studentId: { $in: studentIds } } }] : [];
  return [
    ...pkgMatch,
    { $project: { kind: 'pkg', studentId: 1, netTotal: 1, paidAdjustment: 1 } },
    { $unionWith: { coll: 'payments', pipeline: [
      { $group: { _id: '$packageId', total: { $sum: '$amount' } } },
      { $project: { kind: 'pay', total: 1 } },
    ] } },
    { $unionWith: { coll: 'enrollments', pipeline: [
      ...enrollmentByStudentPipeline(studentIds),
      { $addFields: { kind: 'enr' } },
    ] } },
    { $unionWith: { coll: 'students', pipeline: [
      { $project: { kind: 'stu', status: 1, name: 1, phone: 1, email: 1, referralCode: 1, referredByCode: 1 } },
    ] } },
    { $unionWith: { coll: 'accounts', pipeline: [
      { $match: { role: 'student', studentId: { $ne: null } } },
      { $project: { kind: 'acc', studentId: 1 } },
    ] } },
  ];
}

// Tách kết quả một lượt gọi ở trên thành từng nhóm.
function splitUnionRows(rows) {
  const students = [], packages = [], paymentTotals = [], enrollments = [], accounts = [];
  for (const r of rows) {
    if (r.kind === 'stu') students.push(r);
    else if (r.kind === 'pkg') packages.push(r);
    else if (r.kind === 'pay') paymentTotals.push(r);
    else if (r.kind === 'enr') enrollments.push(r);
    else if (r.kind === 'acc') accounts.push(r);
  }
  return { students, packages, paymentTotals, enrollments, accounts };
}

// Tiền theo HỌC SINH, ghép ở Node từ: gói (bản gọn) + tổng khoản thu theo gói.
function moneyByStudent(packages, paymentTotals) {
  const paid = new Map(paymentTotals.map(r => [String(r._id), r.total || 0]));
  const byStudent = new Map();
  for (const p of packages) {
    const net = p.netTotal || 0;
    const paidRaw = (p.paidAdjustment || 0) + (paid.get(String(p._id)) || 0);
    const pkgPaid = Math.min(Math.max(paidRaw, 0), net);
    const key = String(p.studentId);
    const cur = byStudent.get(key) || { _id: p.studentId, packages: 0, allFull: 1, anyPaid: 0 };
    cur.packages += 1;
    if (!(net > 0 && pkgPaid >= net)) cur.allFull = 0;
    if (pkgPaid > 0) cur.anyPaid = 1;
    byStudent.set(key, cur);
  }
  return [...byStudent.values()];
}

// Ghi danh theo HỌC SINH: trạng thái (đã quy đổi), khoá đang học, ngày bắt đầu sớm nhất.
function enrollmentByStudentPipeline(studentIds) {
  return [
    ...(studentIds ? [{ $match: { studentId: { $in: studentIds } } }] : []),
    { $project: {
      studentId: 1, courseTitle: 1, startDate: 1, classId: 1,
      status: { $let: {
        vars: { st: { $ifNull: ['$status', 'active'] } },
        in: { $cond: [
          { $in: ['$$st', ['active', 'unassigned', '']] },
          { $cond: [{ $ifNull: ['$classId', false] }, 'active', 'unassigned'] },
          '$$st',
        ] },
      } },
    } },
    { $group: {
      _id: '$studentId',
      statuses: { $addToSet: '$status' },
      // Lớp đang học thật sự (status gốc 'active' + đã xếp lớp) — khớp activeStudentIdsOfClass.
      classIds: { $addToSet: { $cond: [
        { $and: [{ $eq: ['$status', 'active'] }, { $ifNull: ['$classId', false] }] }, '$classId', '$$REMOVE',
      ] } },
      courseTitles: { $addToSet: { $cond: [
        { $in: ['$status', ACTIVE_ENROLLMENT_STATUSES] }, { $ifNull: ['$courseTitle', ''] }, '$$REMOVE',
      ] } },
      start: { $min: { $cond: [{ $eq: [{ $ifNull: ['$startDate', ''] }, ''] }, '$$REMOVE', '$startDate'] } },
    } },
  ];
}

// Ghép 3 nguồn thành một dòng gọn cho mỗi học sinh.
function buildIndexRows({ students, money, enrollments, accountedIds }) {
  const moneyBy = new Map(money.map(r => [String(r._id), r]));
  const enrBy = new Map(enrollments.map(r => [String(r._id), r]));
  return students.map(s => {
    const m = moneyBy.get(String(s._id));
    const e = enrBy.get(String(s._id));
    const tuitionStatus = !m || !m.packages ? 'unpaid' : (m.allFull ? 'paid' : (m.anyPaid ? 'partial' : 'unpaid'));
    const status = STATUS_PRIORITY.find(st => (e?.statuses || []).includes(st)) || s.status || null;
    return {
      _id: s._id,
      name: s.name || '', phone: s.phone || '', email: s.email || '',
      referralCode: s.referralCode || '', referredByCode: s.referredByCode || '',
      tuitionStatus,
      status,
      courseTitles: e?.courseTitles || [],
      classIds: (e?.classIds || []).map(String),
      start: e?.start || '',
      hasAccount: accountedIds ? accountedIds.has(String(s._id)) : false,
    };
  });
}

// Tìm theo tên/SĐT/email/mã giới thiệu — không phân biệt hoa thường, như regex 'i' trước đây.
function matchesText(row, q) {
  const needle = String(q).trim().toLowerCase();
  if (!needle) return true;
  return [row.name, row.phone, row.email, row.referralCode, row.referredByCode]
    .some(v => String(v || '').toLowerCase().includes(needle));
}

function filterIndexRows(rows, { tuitionStatus, studentStatus, courseTitle, account, q, classId } = {}) {
  return rows.filter(r => {
    if (q && !matchesText(r, q)) return false;
    if (classId && !r.classIds.includes(String(classId))) return false;
    if (tuitionStatus && r.tuitionStatus !== tuitionStatus) return false;
    if (studentStatus && r.status !== studentStatus) return false;
    if (courseTitle && !r.courseTitles.includes(courseTitle)) return false;
    if (account === 'has-account' && !r.hasAccount) return false;
    if (account === 'no-account' && r.hasAccount) return false;
    return true;
  });
}

// Theo ngày bắt đầu; chưa có ngày thì xuống cuối ở cả hai chiều.
function sortIndexRows(rows, sort = 'desc') {
  const key = r => r.start || MISSING_DATE_LAST;
  return [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka === kb) return String(a._id).localeCompare(String(b._id));
    if (ka === MISSING_DATE_LAST) return 1;
    if (kb === MISSING_DATE_LAST) return -1;
    return sort === 'asc' ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });
}

function statsOfIndexRows(rows) {
  const byStatus = Object.fromEntries(STATUS_PRIORITY.map(st => [st, 0]));
  let paid = 0, partial = 0, unpaid = 0;
  for (const r of rows) {
    if (r.tuitionStatus === 'paid') paid++;
    else if (r.tuitionStatus === 'partial') partial++;
    else unpaid++;
    if (r.status in byStatus) byStatus[r.status]++;
  }
  return { total: rows.length, paid, partial, unpaid, byStatus };
}

// Điều kiện lọc chạy thẳng trên bảng học sinh (tên/SĐT/email/mã giới thiệu, lớp đang chọn).
function studentBaseMatch({ q, studentIds }) {
  const match = {};
  if (studentIds) match._id = { $in: studentIds };
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    match.$or = [{ name: rx }, { phone: rx }, { email: rx }, { referralCode: rx }, { referredByCode: rx }];
  }
  return match;
}

module.exports = {
  paymentTotalsPipeline, studentIndexUnionPipeline, splitUnionRows, matchesText,
  moneyByStudent, enrollmentByStudentPipeline, buildIndexRows,
  filterIndexRows, sortIndexRows, statsOfIndexRows, studentBaseMatch, MISSING_DATE_LAST,
};
