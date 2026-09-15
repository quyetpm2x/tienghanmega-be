const { allocate } = require('./allocation');

// Mọi phép tính tiền của gói đăng ký nằm ở đây, thuần (không chạm database) để test
// được và để backend là nguồn chuẩn duy nhất — frontend chỉ hiển thị xem trước.
const COMMISSION_RATE = 0.1;
// Ưu tiên khi suy trạng thái học sinh từ nhiều ghi danh: còn học ít nhất một khoá
// đang học thì là đang học; không thì "chưa xếp lớp" (đã đăng ký, chờ học); chỉ khi không
// còn khoá nào ở mức cao hơn mới xét tiếp.
const STATUS_PRIORITY = ['active', 'unassigned', 'reserved', 'transferred', 'completed', 'dropped'];

class PackageMathError extends Error {}

const isMoney = v => Number.isInteger(v) && v >= 0;

function priceItems({ discount, discountAllocation, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PackageMathError('Gói phải có ít nhất một khoá');
  }
  if (discountAllocation !== 'auto' && discountAllocation !== 'manual') {
    throw new PackageMathError('Cách chia giảm giá không hợp lệ');
  }
  items.forEach((it, i) => {
    if (!isMoney(it.listPrice)) throw new PackageMathError(`Giá niêm yết khoá thứ ${i + 1} không hợp lệ`);
  });
  const listTotal = items.reduce((s, it) => s + it.listPrice, 0);

  let shares;
  if (discountAllocation === 'auto') {
    if (!isMoney(discount)) throw new PackageMathError('Số tiền giảm không hợp lệ');
    if (discount > listTotal) throw new PackageMathError('Số tiền giảm không được lớn hơn tổng giá niêm yết');
    shares = allocate(discount, items.map(it => it.listPrice));
  } else {
    // Admin tự chia: tổng các phần chia CHÍNH LÀ số giảm của gói — không để hai con
    // số tồn tại song song rồi lệch nhau.
    shares = items.map((it, i) => {
      const s = it.discountShare;
      if (!isMoney(s)) throw new PackageMathError(`Phần giảm khoá thứ ${i + 1} không hợp lệ`);
      if (s > it.listPrice) throw new PackageMathError(`Phần giảm khoá thứ ${i + 1} lớn hơn giá niêm yết`);
      return s;
    });
  }
  const finalDiscount = shares.reduce((a, b) => a + b, 0);
  return {
    listTotal,
    discount: finalDiscount,
    netTotal: listTotal - finalDiscount,
    discountAllocation,
    items: items.map((it, i) => ({
      listPrice: it.listPrice,
      discountShare: shares[i],
      netPrice: it.listPrice - shares[i],
    })),
  };
}

function paymentState({ netTotal, paymentsTotal, paidAdjustment }) {
  const paidRaw = (paymentsTotal || 0) + (paidAdjustment || 0);
  // Không có chuyện đóng dư: đã nộp ghi nhận tối đa bằng số phải thu của gói.
  const paid = Math.min(Math.max(paidRaw, 0), netTotal || 0);
  let tuitionStatus = 'partial';
  if (paid === 0) tuitionStatus = 'unpaid';
  else if ((netTotal || 0) > 0 && paid >= netTotal) tuitionStatus = 'paid';
  return { paidRaw, paid, debt: (netTotal || 0) - paid, tuitionStatus };
}

function deriveStudentStatus(statuses) {
  for (const s of STATUS_PRIORITY) if (statuses.includes(s)) return s;
  return null;
}

// Trạng thái hợp lệ của MỘT khoá theo việc đã có lớp hay chưa: "đang học" cần có lớp,
// "chưa xếp lớp" thì không được có lớp. Các trạng thái khác (bảo lưu, dừng…) giữ nguyên.
function normalizeEnrollmentStatus(status, hasClass) {
  if (!status || status === 'active' || status === 'unassigned') return hasClass ? 'active' : 'unassigned';
  return status;
}

function commissionOf(listTotal) {
  return { basePrice: listTotal, rate: COMMISSION_RATE, amount: Math.round(listTotal * COMMISSION_RATE) };
}

// Gộp nhiều gói của một học sinh cho các màn hình chỉ cần một dòng (danh sách học
// sinh, affiliate). Đã đủ khi MỌI gói đã đủ; chưa đóng khi chưa gói nào có tiền.
function summarizePackages(packages) {
  const sum = key => packages.reduce((s, p) => s + (p[key] || 0), 0);
  let tuitionStatus = 'unpaid';
  if (packages.length > 0 && packages.every(p => p.tuitionStatus === 'paid')) tuitionStatus = 'paid';
  else if (packages.some(p => (p.paid || 0) > 0)) tuitionStatus = 'partial';
  return {
    listTotal: sum('listTotal'), discount: sum('discount'), netTotal: sum('netTotal'),
    paid: sum('paid'), debt: sum('debt'), tuitionStatus,
  };
}

module.exports = {
  priceItems, paymentState, deriveStudentStatus, normalizeEnrollmentStatus, commissionOf, summarizePackages,
  PackageMathError, STATUS_PRIORITY, COMMISSION_RATE,
};
