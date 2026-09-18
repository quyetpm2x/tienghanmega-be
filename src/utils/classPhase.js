const AppError = require('./AppError');
const { effectiveAssignments } = require('./classAssignment');

// Một lớp có thể chạy NHIỀU KHOÁ nối tiếp: xong khoá A lại học tiếp khoá B, thường đổi luôn
// lịch học (thứ/giờ), lương và giảng viên. Mỗi đoạn như vậy là một "giai đoạn":
//   { courseTitle, courseCategory, fromDate, toDate|null, days, time }
// Lớp cũ chưa có phases được coi như CÓ MỘT giai đoạn suy từ chính lớp, nên mọi tính toán cũ
// giữ nguyên kết quả. Hai giai đoạn không được chồng ngày — mỗi ngày dạy thuộc đúng một khoá.
const WEEKDAY_TO_JS = { T2: 1, T3: 2, T4: 3, T5: 4, T6: 5, T7: 6, CN: 0 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = n => String(n).padStart(2, '0');
const fmtDateLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Parse "YYYY-MM-DD" thành nửa đêm GIỜ ĐỊA PHƯƠNG. KHÔNG dùng `new Date(str)`: chuỗi dạng
// này được parse thành nửa đêm UTC, rồi getDay()/getFullYear() lại đọc theo giờ địa phương —
// ở múi giờ ÂM (VD America/New_York) nó lùi về ngày hôm trước, làm lịch lớp mất buổi cuối
// khoá và đẻ thêm buổi trước ngày khai giảng. Tách số ra rồi dựng ngày địa phương thì đúng
// ở mọi múi giờ, không phải dựa vào việc ghim TZ.
const parseLocalDate = str => { const [y, m, d] = String(str).split('-').map(Number); return new Date(y, m - 1, d); };

function effectivePhases(cls) {
  const phases = (cls && cls.phases) || [];
  if (phases.length) return phases.map(p => (p.toObject ? p.toObject() : p));
  if (!cls) return [];
  return [{
    courseTitle: cls.course || '',
    courseCategory: cls.courseCategory || null,
    days: cls.days || '',
    time: cls.time || '',
    fromDate: cls.startDate || '',
    toDate: cls.endDate || null,
    // Khoá suy ra phải mang theo CẢ giảng viên, nếu không lớp chưa di trú sẽ hiện "chưa có
    // giảng viên nào" kèm cảnh báo khoảng trống, trong khi thẻ lớp bên ngoài vẫn hiện đúng
    // tên người dạy — hai chỗ nói hai chuyện về cùng một lớp.
    // rate để null = ăn theo lương/buổi mặc định của lớp, đúng như mô hình cũ.
    teachers: effectiveAssignments(cls).map(a => ({
      teacherId: a.teacherId || null, teacherName: a.teacherName || '',
      fromDate: a.fromDate || cls.startDate || '', toDate: a.toDate ?? (cls.endDate || null),
      rate: null,
    })),
  }];
}

const covers = (p, date) => {
  if (!p.fromDate || date < p.fromDate) return false;
  return !p.toDate || date <= p.toDate;
};

// Giai đoạn chứa ngày đó (null nếu ngày nằm ngoài mọi giai đoạn — ví dụ quãng nghỉ giữa 2 khoá).
function phaseAt(cls, date) {
  return effectivePhases(cls).find(p => covers(p, date)) || null;
}

// Ngày dạy của lớp, sinh theo lịch RIÊNG của từng giai đoạn. `until` là ngày chốt cho các giai
// đoạn còn mở (thường là hôm nay hoặc cuối khoảng đang xem).
function scheduledDatesOfClass(cls, until) {
  const out = [];
  for (const p of effectivePhases(cls)) {
    const from = p.fromDate;
    const to = p.toDate || until;
    if (!from || !to || !p.days) continue;
    const selected = new Set(String(p.days).split(',').map(s => s.trim()).filter(Boolean)
      .map(d => WEEKDAY_TO_JS[d]).filter(n => n !== undefined));
    if (!selected.size) continue;
    const cur = parseLocalDate(from);
    const end = parseLocalDate(to);
    while (cur <= end) {
      if (selected.has(cur.getDay())) out.push(fmtDateLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return [...new Set(out)].sort();
}

function validatePhases(phases = []) {
  for (const p of phases) {
    if (!String(p.courseTitle || '').trim()) throw new AppError('Vui lòng chọn khoá học cho giai đoạn', 400);
    if (!DATE_RE.test(p.fromDate || '')) throw new AppError('Vui lòng chọn ngày bắt đầu của giai đoạn', 400);
    if (p.toDate && !DATE_RE.test(p.toDate)) throw new AppError('Ngày kết thúc không hợp lệ', 400);
    if (p.toDate && p.toDate < p.fromDate) throw new AppError('Ngày kết thúc phải sau ngày bắt đầu', 400);
    if (!String(p.days || '').trim()) throw new AppError('Vui lòng chọn thứ học của giai đoạn', 400);
    // Mã thứ sai (VD "T9") lưu được nhưng scheduledDatesOfClass lọc sạch → lớp im lặng
    // về 0 buổi và giảng viên mất lương mà không có lỗi nào. Chặn ngay tại đây.
    const badDay = String(p.days).split(',').map(x => x.trim()).filter(Boolean)
      .find(d => WEEKDAY_TO_JS[d] === undefined);
    if (badDay) throw new AppError(`Thứ học "${badDay}" không hợp lệ`, 400);

    // Giảng viên của RIÊNG giai đoạn này. Hai đoạn không được chồng ngày (mỗi thời điểm
    // chỉ một giảng viên dạy), và phải nằm trọn trong khoảng ngày của giai đoạn — nếu
    // không, buổi dạy sẽ tính cho người không còn phụ trách khoá đó.
    const teachers = p.teachers || [];
    for (const a of teachers) {
      if (!DATE_RE.test(a.fromDate || '')) throw new AppError('Vui lòng chọn ngày bắt đầu cho giảng viên', 400);
      if (a.toDate && !DATE_RE.test(a.toDate)) throw new AppError('Ngày kết thúc của giảng viên không hợp lệ', 400);
      if (a.toDate && a.toDate < a.fromDate) throw new AppError('Ngày kết thúc của giảng viên phải sau ngày bắt đầu', 400);
      if (a.rate != null && !(Number(a.rate) > 0)) throw new AppError('Lương/buổi của giảng viên phải lớn hơn 0', 400);
      // Đoạn phụ trách VƯỢT RA NGOÀI khoảng ngày của khoá chỉ là CẢNH BÁO, không chặn:
      // admin có thể cố ý (VD giảng viên nhận luôn phần đầu khoá sau). Buổi nằm ngoài mọi
      // khoá của lớp vốn đã không sinh ra, nên không đẻ tiền lạ. Cái phải giữ là "một thời
      // điểm một giảng viên" — kiểm ở vòng dưới, trên TOÀN BỘ các khoá.
    }
  }

  // Chồng ngày kiểm trên TOÀN BỘ đoạn giảng viên của mọi khoá, không chỉ trong cùng một
  // khoá: từ khi cho phép đoạn vượt ra ngoài khoảng của khoá, hai người ở hai khoá khác
  // nhau vẫn có thể cùng nhận một ngày — lúc đó không biết buổi đó tính cho ai.
  const allTeachers = phases.flatMap(p => (p.teachers || []).map(a => ({ ...a, courseTitle: p.courseTitle })));
  for (let i = 0; i < allTeachers.length; i++) {
    for (let j = i + 1; j < allTeachers.length; j++) {
      const a = allTeachers[i], b = allTeachers[j];
      const aTo = a.toDate || '9999-12-31', bTo = b.toDate || '9999-12-31';
      if (a.fromDate <= bTo && b.fromDate <= aTo) {
        throw new AppError('Hai giảng viên bị chồng ngày nhau — mỗi thời điểm chỉ một giảng viên dạy', 400);
      }
    }
  }
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const a = phases[i], b = phases[j];
      const aTo = a.toDate || '9999-12-31', bTo = b.toDate || '9999-12-31';
      if (a.fromDate <= bTo && b.fromDate <= aTo) {
        throw new AppError('Hai giai đoạn của lớp bị chồng ngày nhau', 400);
      }
    }
  }
  return phases;
}

// Lớp vẫn giữ course/days/time/teacher/startDate/endDate phản ánh KHOÁ ĐANG CHẠY, để danh
// sách lớp, lịch công khai, cổng học sinh/giảng viên hiển thị đúng mà không phải đọc phases.
// Không có khoá nào đang chạy hôm nay (đã kết thúc, hoặc chưa khai giảng) thì lấy khoá gần
// nhất theo ngày bắt đầu — giống cách trang lớp vẫn hiển thị lớp đã đóng.
function classFieldsFromPhases(phases, today) {
  const list = [...(phases || [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  if (!list.length) return null;
  // Hôm nay nằm ngoài mọi khoá: lớp ĐÃ đóng thì lấy khoá cuối, lớp CHƯA khai giảng thì
  // lấy khoá đầu — không thể quảng cáo khoá cuối cho một lớp còn chưa mở.
  const now = list.find(p => p.fromDate <= today && (!p.toDate || today <= p.toDate))
    || (today < list[0].fromDate ? list[0] : list[list.length - 1]);
  // Tra giảng viên theo ngày KẸP trong khoá đó. Dùng thẳng `today` sẽ trả null cho lớp đã
  // kết thúc hoặc đang ở khoảng hở → ghi đè teacher/teacherId của lớp thành rỗng, và
  // giảng viên MẤT QUYỀN vào lớp của mình (teacherPortal lọc theo Class.teacherId).
  const outside = today < now.fromDate || (now.toDate && today > now.toDate);
  const ref = today < now.fromDate ? now.fromDate
    : (now.toDate && today > now.toDate ? now.toDate : today);
  const sorted = [...(now.teachers || [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  // Khoảng hở NGAY TRONG khoá thì lớp thật sự đang không ai phụ trách — để rỗng, đúng như
  // updateTeacherAssignmentDate vẫn làm khi admin đóng hẳn đoạn cuối.
  const t = sorted.find(a => a.fromDate <= ref && (!a.toDate || ref <= a.toDate))
    || (outside ? (today < now.fromDate ? sorted[0] : sorted[sorted.length - 1]) : null)
    || null;
  return {
    course: now.courseTitle || '',
    courseCategory: now.courseCategory ?? null,
    days: now.days || '',
    time: now.time || '',
    startDate: list[0].fromDate,
    endDate: list[list.length - 1].toDate || '',
    teacher: t ? (t.teacherName || '') : '',
    teacherId: t ? (t.teacherId || null) : null,
  };
}

// Khoá còn để ngỏ ngày kết thúc. Lớp có khoá như vậy sẽ sinh buổi dạy — và phát sinh lương —
// mỗi tuần cho tới ngày chốt, mãi mãi. Đúng với lớp đang chạy, nhưng sai với lớp thực tế đã
// ngừng dạy mà quên đóng ngày. Class.status hoàn toàn trang trí: không dòng nào trong đường
// tính lương đọc nó, nên "đóng lớp" mà không điền ngày kết thúc thì lương vẫn chạy tiếp.
function openEndedPhase(cls) {
  // Nhận cả LỚP lẫn mảng khoá, và luôn đi qua effectivePhases: lớp chưa di trú có
  // `phases: []` nhưng vẫn sinh buổi từ course/days/startDate/endDate của chính nó —
  // đọc `phases` thô sẽ bỏ lọt đúng nhóm lớp nguy hiểm nhất (script di trú BỎ QUA lớp
  // thiếu dữ liệu, nên chúng ở lại mãi với phases rỗng).
  const list = Array.isArray(cls) ? cls : effectivePhases(cls);
  // Chỉ tính là "để ngỏ" khi khoá đó THỰC SỰ sinh được buổi: thiếu ngày bắt đầu hoặc
  // thiếu thứ học thì scheduledDatesOfClass bỏ qua, không phát sinh lương, không cần chặn.
  return list.find(p => !p.toDate && p.fromDate && p.days) || null;
}

module.exports = { openEndedPhase, effectivePhases, phaseAt, validatePhases, scheduledDatesOfClass, classFieldsFromPhases, WEEKDAY_TO_JS };
