const AppError = require('./AppError');

// Lương/buổi của một lớp có thể đổi theo thời gian và theo từng giảng viên:
//   Class.ratePerSession  = mức mặc định (dùng khi ngày dạy không nằm trong khoảng nào)
//   Class.rateHistory[]   = { rate, fromDate, toDate|null, teacherIds[] }
//                           teacherIds rỗng = áp cho MỌI giảng viên của lớp
// Quy tắc chọn: khoảng dành RIÊNG cho giảng viên thắng khoảng áp cho tất cả; cùng phạm vi thì
// lấy khoảng có ngày bắt đầu muộn nhất. Buổi dạy thay có mức riêng thì vẫn ưu tiên mức đó
// (xử lý ở nơi tính lương, không ở đây).

const covers = (seg, date) => {
  const from = seg.fromDate || '';
  const to = seg.toDate || '';
  if (!from || date < from) return false;
  return !to || date <= to;
};

const forTeacher = (seg, teacherId) => {
  const ids = (seg.teacherIds || []).map(String).filter(Boolean);
  return ids.length === 0 || (teacherId != null && ids.includes(String(teacherId)));
};

function rateAt(cls, date, teacherId) {
  // Mô hình MỚI: lương nằm ở đoạn giảng viên của khoá chứa ngày đó. Không tìm thấy đoạn
  // nào (khoảng hở không ai phụ trách, hoặc hỏi cho giảng viên khác) thì rơi xuống
  // rateHistory rồi ratePerSession như lớp cũ.
  for (const p of ((cls && cls.phases) || [])) {
    if (!covers(p, date)) continue;
    const seg = (p.teachers || []).find(a => covers(a, date)
      && (teacherId == null || String(a.teacherId) === String(teacherId)));
    if (seg) return seg.rate ?? (cls ? (cls.ratePerSession ?? null) : null);
  }
  const history = (cls && cls.rateHistory) || [];
  const matches = history.filter(seg => covers(seg, date) && forTeacher(seg, teacherId));
  if (matches.length === 0) return cls ? (cls.ratePerSession ?? null) : null;
  // Ưu tiên: gán đích danh giảng viên → rồi tới ngày bắt đầu muộn nhất.
  const specific = matches.filter(seg => (seg.teacherIds || []).length > 0);
  const pool = specific.length ? specific : matches;
  return pool.reduce((best, seg) => (!best || (seg.fromDate || '') > (best.fromDate || '') ? seg : best), null).rate;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const sameScope = (a, b) => {
  const ids = seg => [...new Set((seg.teacherIds || []).map(String))].sort().join(',');
  return ids(a) === ids(b);
};
const overlaps = (a, b) => {
  const aTo = a.toDate || '9999-12-31';
  const bTo = b.toDate || '9999-12-31';
  return a.fromDate <= bTo && b.fromDate <= aTo;
};

// Kiểm tra trước khi lưu: mức lương > 0, có ngày bắt đầu, ngày kết thúc không sớm hơn ngày
// bắt đầu, và hai khoảng CÙNG phạm vi giảng viên không được chồng nhau (sẽ không biết lấy mức
// nào). Khác phạm vi thì được phép — mức riêng của giảng viên đè lên mức chung.
function validateRateHistory(history = []) {
  for (const seg of history) {
    if (!(Number(seg.rate) > 0)) throw new AppError('Mức lương/buổi phải lớn hơn 0', 400);
    if (!DATE_RE.test(seg.fromDate || '')) throw new AppError('Vui lòng chọn ngày bắt đầu áp dụng', 400);
    if (seg.toDate && !DATE_RE.test(seg.toDate)) throw new AppError('Ngày kết thúc không hợp lệ', 400);
    if (seg.toDate && seg.toDate < seg.fromDate) throw new AppError('Ngày kết thúc phải sau ngày bắt đầu', 400);
  }
  for (let i = 0; i < history.length; i++) {
    for (let j = i + 1; j < history.length; j++) {
      if (sameScope(history[i], history[j]) && overlaps(history[i], history[j])) {
        throw new AppError('Hai khoảng lương của cùng giảng viên bị chồng nhau', 400);
      }
    }
  }
  return history;
}

module.exports = { rateAt, validateRateHistory };
