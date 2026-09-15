const { categoryOf } = require('./courseCategory');
const { STATUS_PRIORITY, normalizeEnrollmentStatus } = require('./packageMath');
const { packageFacts, aggregateByMonth, vnDateStr } = require('./revenueModel');

// Ánh xạ THUẦN từ dữ liệu cũ (một học sinh — một lớp — một học phí) sang gói + ghi danh.
// Không chạm database để kiểm chứng được bằng test và chạy thử (dry-run) trước khi ghi.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Đúng quy tắc doanh thu trước chuyển đổi: coursePrice, rơi về amount khi chưa nhập giá.
function legacyContract(s) {
  return (s.coursePrice || 0) > 0 ? s.coursePrice : (s.amount || 0);
}

function groupPayments(students, payments) {
  const ids = new Set(students.map(s => String(s._id)));
  const byStudent = new Map();
  const orphanPayments = [];
  for (const p of payments) {
    const k = String(p.studentId);
    if (!ids.has(k)) { orphanPayments.push(p); continue; }
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k).push(p);
  }
  return { byStudent, orphanPayments };
}

function buildMigrationPlan({ students, payments, classes, skipStudentIds = [] }) {
  const classById = new Map(classes.map(c => [String(c._id), c]));
  const classByName = new Map(classes.map(c => [c.name, c]));
  const skip = new Set(skipStudentIds.map(String));
  const { byStudent, orphanPayments } = groupPayments(students, payments);

  const items = [];
  const skipped = [];
  for (const s of students) {
    const id = String(s._id);
    if (skip.has(id)) { skipped.push({ studentId: id, name: s.name, reason: 'đã có gói đăng ký' }); continue; }

    const warnings = [];
    const contract = legacyContract(s);
    const amount = s.amount || 0;
    const pays = byStudent.get(id) || [];
    const paymentsTotal = pays.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Lớp: ưu tiên classId còn tồn tại; không có thì tra theo tên. Tên hiển thị luôn đọc
    // lại từ Class vì đổi tên lớp chưa bao giờ cascade sang Student.className.
    let cls = s.classId ? classById.get(String(s.classId)) || null : null;
    if (s.classId && !cls) warnings.push(`classId ${s.classId} không còn tồn tại`);
    if (!cls && s.className) {
      cls = classByName.get(s.className) || null;
      if (cls && s.classId) warnings.push(`tìm lại lớp theo tên "${s.className}"`);
    }
    if (!cls && (s.classId || s.className)) warnings.push(`không tìm thấy lớp "${s.className || ''}" — ghi danh không gắn lớp`);
    if (cls && s.className && cls.name !== s.className) warnings.push(`tên lớp đã lưu "${s.className}" khác tên hiện tại "${cls.name}"`);
    if (paymentsTotal > amount) warnings.push(`tổng khoản thu ${paymentsTotal} lớn hơn số đã nộp ${amount} → điều chỉnh âm`);
    if (amount > contract) warnings.push(`đã nộp ${amount} vượt học phí ${contract} (báo cáo sẽ kẹp)`);

    const startDate = DATE_RE.test(String(s.startDate || '').slice(0, 10)) ? String(s.startDate).slice(0, 10) : '';
    const courseTitle = s.level || (cls && cls.course) || '';

    items.push({
      studentId: id,
      name: s.name,
      warnings,
      paymentIds: pays.map(p => String(p._id)),
      package: {
        studentId: s._id,
        listTotal: contract,
        discount: 0,
        netTotal: contract,
        discountAllocation: 'auto',
        // Giữ nguyên "đã nộp" cũ: Σ khoản thu + điều chỉnh = Student.amount.
        paidAdjustment: amount - paymentsTotal,
        adjustmentHistory: (s.amountHistory || []).map(h => ({
          from: h.from, to: h.to, changedBy: h.changedBy || '', changedAt: h.changedAt,
          note: 'Chép từ lịch sử sửa số tiền đã nộp của học sinh',
        })),
        note: '',
        legacy: {
          coursePrice: s.coursePrice || 0, amount, tuitionStatus: s.tuitionStatus || '',
          level: s.level || '', className: s.className || '', classId: s.classId || null, status: s.status || '',
        },
      },
      enrollment: {
        studentId: s._id,
        classId: cls ? cls._id : null,
        className: cls ? cls.name : (s.className || ''),
        courseTitle,
        courseCategory: categoryOf(courseTitle),
        listPrice: contract,
        discountShare: 0,
        netPrice: contract,
        startDate,
        // Đang học mà không tìm được lớp → chưa xếp lớp (không lọt vào danh sách lớp nào).
        status: normalizeEnrollmentStatus(STATUS_PRIORITY.includes(s.status) ? s.status : 'active', !!cls),
        transferHistory: (s.transferHistory || []).map(h => ({
          classId: h.classId || null, className: h.className || '', courseTitle: h.level || '', transferredAt: h.transferredAt,
        })),
      },
    });
  }
  return { items, skipped, orphanPayments };
}

function checkPlan(plan, { students, payments }) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok, detail });
  const studentById = new Map(students.map(s => [String(s._id), s]));
  const paymentById = new Map(payments.map(p => [String(p._id), p]));

  add('Mọi học sinh đều được chuyển đổi hoặc bỏ qua có lý do',
    plan.items.length + plan.skipped.length === students.length,
    `${plan.items.length} chuyển + ${plan.skipped.length} bỏ qua / ${students.length} học sinh`);

  const sumNet = plan.items.reduce((s, it) => s + it.package.netTotal, 0);
  const sumContract = plan.items.reduce((s, it) => s + legacyContract(studentById.get(it.studentId)), 0);
  add('Σ học phí gói = Σ học phí cũ', sumNet === sumContract, `${sumNet} vs ${sumContract}`);

  const wrongPaid = plan.items.filter(it => {
    const paid = it.paymentIds.reduce((s, pid) => s + (paymentById.get(pid)?.amount || 0), 0) + it.package.paidAdjustment;
    return paid !== (studentById.get(it.studentId).amount || 0);
  });
  add('Mỗi học sinh: Σ khoản thu + điều chỉnh = số đã nộp cũ', wrongPaid.length === 0,
    wrongPaid.map(it => it.name).slice(0, 10).join(', '));

  const assigned = plan.items.flatMap(it => it.paymentIds);
  const skippedIds = new Set(plan.skipped.map(s => s.studentId));
  const orphanIds = new Set(plan.orphanPayments.map(p => String(p._id)));
  const expected = payments.filter(p => !orphanIds.has(String(p._id)) && !skippedIds.has(String(p.studentId)));
  add('Mỗi khoản thu của học sinh được chuyển đổi gắn đúng một gói',
    assigned.length === expected.length && new Set(assigned).size === assigned.length,
    `${assigned.length} gắn / ${expected.length} cần gắn`);

  const badShape = plan.items.filter(it =>
    it.package.listTotal !== it.enrollment.listPrice || it.package.netTotal !== it.enrollment.netPrice || it.package.discount !== 0);
  add('Gói và ghi danh khớp giá, không giảm giá', badShape.length === 0, badShape.map(it => it.name).slice(0, 10).join(', '));
  return checks;
}

// Quy tắc doanh thu TRƯỚC chuyển đổi (revenueController bản cũ): loại học sinh đã nghỉ,
// loại học sinh không có ngày khai giảng; tháng chốt theo khoản thu sớm nhất của học sinh.
function legacyMonthly(students, payments) {
  const firstPaid = new Map();
  for (const p of payments) {
    const k = String(p.studentId);
    const d = vnDateStr(p.paidAt);
    if (!firstPaid.has(k) || d < firstPaid.get(k)) firstPaid.set(k, d);
  }
  const months = {};
  for (const s of students) {
    if (s.status === 'dropped') continue;
    if (!s.startDate) continue;
    if (!((s.coursePrice || 0) > 0 || (s.amount || 0) > 0)) continue;
    let date = firstPaid.get(String(s._id));
    if (!date && (s.amount || 0) > 0 && DATE_RE.test(String(s.startDate).slice(0, 10))) date = String(s.startDate).slice(0, 10);
    if (!date) continue;
    const contract = legacyContract(s);
    const m = months[date.slice(0, 7)] || (months[date.slice(0, 7)] = { revenue: 0, collected: 0 });
    m.revenue += contract;
    m.collected += Math.min(s.amount || 0, contract);
  }
  return months;
}

function planMonthly(plan, payments) {
  const packages = plan.items.map(it => ({
    _id: it.studentId, netTotal: it.package.netTotal, paidAdjustment: it.package.paidAdjustment,
    enrollments: [{ startDate: it.enrollment.startDate, courseCategory: it.enrollment.courseCategory, netPrice: it.enrollment.netPrice }],
  }));
  const pkgOfPayment = new Map(plan.items.flatMap(it => it.paymentIds.map(pid => [pid, it.studentId])));
  const mapped = payments
    .filter(p => pkgOfPayment.has(String(p._id)))
    .map(p => ({ packageId: pkgOfPayment.get(String(p._id)), amount: p.amount, paidAt: p.paidAt }));
  const agg = aggregateByMonth(packages, packageFacts(packages, mapped), {});
  return Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, { revenue: v.revenue, collected: v.collected }]));
}

function compareMonthly(legacy, fresh) {
  const months = [...new Set([...Object.keys(legacy), ...Object.keys(fresh)])].sort();
  return months.map(month => {
    const l = legacy[month] || { revenue: 0, collected: 0 };
    const n = fresh[month] || { revenue: 0, collected: 0 };
    return {
      month,
      legacyRevenue: l.revenue, newRevenue: n.revenue, diffRevenue: n.revenue - l.revenue,
      legacyCollected: l.collected, newCollected: n.collected, diffCollected: n.collected - l.collected,
    };
  });
}

// Học sinh quy tắc cũ bỏ qua nhưng quy tắc mới tính — nguồn DUY NHẤT được phép gây chênh.
function explainDelta(students, payments) {
  const hasPayment = new Set(payments.map(p => String(p.studentId)));
  const out = [];
  for (const s of students) {
    const contract = legacyContract(s);
    if (!(contract > 0)) continue;
    const closesInNew = hasPayment.has(String(s._id)) || ((s.amount || 0) > 0 && DATE_RE.test(String(s.startDate || '').slice(0, 10)));
    if (!closesInNew) continue;
    if (s.status === 'dropped') out.push({ studentId: String(s._id), name: s.name, reason: 'đã nghỉ — nay vẫn tính doanh thu đã ghi nhận', contract });
    else if (!s.startDate) out.push({ studentId: String(s._id), name: s.name, reason: 'không có ngày khai giảng nhưng có khoản thu', contract });
  }
  return out;
}

module.exports = {
  legacyContract, buildMigrationPlan, checkPlan, legacyMonthly, planMonthly, compareMonthly, explainDelta,
};
