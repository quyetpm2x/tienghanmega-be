const { rateAt } = require('./classRate');
const { phaseAt } = require('./classPhase');
const { teacherIdOnDate } = require('./classAssignment');

// Một buổi dạy tính cho AI, BAO NHIÊU TIỀN, vào KỲ LƯƠNG NÀO — một nơi duy nhất.
// PHẢI giữ cùng quy tắc với tienhanmega-fe/lib/sessionPay.ts.
//
// Nguyên tắc sống còn: bản ghi CŨ không có payDate/paidTeacherId/paidRate phải rơi
// hết vào nhánh fallback và ra ĐÚNG con số như trước khi có file này. Không migration,
// không lệch kỳ lương lịch sử. Mọi nhánh mới chỉ áp cho bản ghi tạo sau.

// Ai được tính buổi này, nếu đã chốt đích danh. null = suy từ lịch phân công của lớp.
// 'substituted' là dạng hẹp có sẵn từ trước của cùng khái niệm — giữ trong chuỗi
// fallback thay vì di trú, để buổi dạy thay cũ chạy y hệt.
function paidTeacherIdOf(s) {
  if (s?.paidTeacherId) return String(s.paidTeacherId);
  if (s?.status === 'substituted' && s.substituteTeacherId) return String(s.substituteTeacherId);
  return null;
}

// fallbackTeacherId: người phụ trách lớp tại NGÀY GỐC (s.date) — bên gọi đã biết sẵn
// nên truyền vào, tránh tính lại.
function resolveSession(cls, s, fallbackTeacherId) {
  const teacherId = paidTeacherIdOf(s) ?? (fallbackTeacherId != null ? String(fallbackTeacherId) : null);
  // Đơn giá tra theo AI, tại NGÀY GỐC. Với buổi được GÁN TAY sang người khác
  // (paidTeacherId), người nhận thường không có đoạn nào trong khoá gốc nên tra theo họ
  // sẽ trượt hết vòng phases → về mức mặc định của lớp, hoặc null nếu lớp không có mức
  // mặc định (buổi biến mất khỏi sổ lương của CẢ HAI người). Đơn giá phải kế thừa buổi
  // gốc, đúng như thiết kế: đổi người thì tiền vẫn là tiền của buổi đó.
  // CHỈ áp cho paidTeacherId (field mới) — buổi dạy thay cũ giữ nguyên cách tra theo
  // người dạy thay, nếu không sẽ đổi số lương lịch sử.
  const rateTeacher = s?.paidTeacherId ? (teacherIdOnDate(cls, s.date) ?? teacherId) : teacherId;
  return {
    // Kỳ lương theo ngày dạy THẬT. Bản ghi cũ không có payDate → ngày gốc, y như trước.
    payDate: s?.payDate || s.date,
    teacherId,
    // Đơn giá luôn tra tại NGÀY GỐC: buổi dời lịch là buổi của khoá cũ bị dời sang
    // ngày rảnh, không được ăn theo mức của khoá sau.
    rate: s?.paidRate ?? s?.substituteRate ?? rateAt(cls, s.date, rateTeacher),
    // Buổi thuộc khoá chứa NGÀY GỐC, vì lý do trên.
    phase: phaseAt(cls, s.date),
  };
}

module.exports = { resolveSession, paidTeacherIdOf };
