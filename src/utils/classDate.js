const { phaseAt } = require('./classPhase');

// Bất biến: KHÔNG được tồn tại buổi dạy hay điểm danh nằm ngoài lịch của lớp ("mồ côi").
// Bản ghi mồ côi không được tính vào lịch nhưng vẫn nằm trong DB, gây lệch số buổi và —
// với buổi dạy thay — còn được trả tiền cho một ngày lớp không hề có lịch.
// PHẢI giữ cùng quy tắc với tienhanmega-fe/lib/classDate.ts.
//
// Ngoại lệ DUY NHẤT: buổi học bù được điểm danh vào NGÀY MỚI, nên StudentAttendance
// được phép nằm ngoài lịch miễn `replacesDate` trỏ tới một ngày CÓ trong lịch.
// TeacherSession không có ngoại lệ này: buổi dời lịch vẫn lưu ở ngày gốc, `rescheduledDate`
// chỉ là ghi chú ngày dạy thật.
//
// KHÔNG liệt kê lịch rồi tra trong đó: lớp còn mở (endDate rỗng) sẽ sinh ra gần 3 triệu
// ngày mỗi lần gọi. Một ngày thuộc lịch KHI VÀ CHỈ KHI nó rơi vào một giai đoạn và đúng
// thứ mà giai đoạn đó học — kiểm trực tiếp, O(số giai đoạn).
const JS_TO_WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Dùng đúng cách dựng Date như scheduledDatesOfClass để hai bên không lệch nhau.
function weekdayCodeOf(dateStr) {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : JS_TO_WEEKDAY[d.getDay()];
}

function isScheduledDate(cls, date) {
  if (!cls || !date) return false;
  const p = phaseAt(cls, date);
  if (!p || !p.days) return false;
  const code = weekdayCodeOf(date);
  if (!code) return false;
  return String(p.days).split(',').map(s => s.trim()).filter(Boolean).includes(code);
}

function isValidClassDate(cls, record, kind) {
  if (!cls || !record?.date) return false;
  if (isScheduledDate(cls, record.date)) return true;
  if (kind === 'attendance' && record.replacesDate) return isScheduledDate(cls, record.replacesDate);
  return false;
}

module.exports = { isValidClassDate, isScheduledDate };
