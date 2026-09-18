const { editedAt } = require('./teacherLedger');
const { belongsToClass } = require('./classLink');

// Lần nhập/sửa thật gần nhất của bản ghi: lúc tạo hoặc lần dời lịch cuối. Không dựa vào
// updatedAt vì script hàng loạt (backfill-class-ids bản cũ) đã đè nó thành cùng một giờ cho
// mọi bản ghi — chỉ còn lệch nhau vài trăm ms, không phản ánh ai sửa sau.
function enteredAt(s) {
  const times = [s.createdAt, ...(s.rescheduleHistory || []).map(h => h.savedAt)]
    .filter(Boolean).map(t => new Date(t).getTime());
  return times.length ? Math.max(...times) : editedAt(s);
}

// Kế hoạch (thuần) dọn bản ghi buổi dạy trùng: mỗi (lớp, ngày) chỉ giữ bản nhập/sửa sau cùng
// (bằng nhau thì theo updatedAt); chỉ bỏ các bản cũ gây lệch giữa các màn hình.
function buildSessionDedupePlan({ classes, sessions }) {
  const groups = new Map();
  for (const s of sessions) {
    const cls = classes.find(c => belongsToClass(s, c));
    const key = `${cls ? cls._id : `name:${s.className}`}__${s.date}`;
    if (!groups.has(key)) groups.set(key, { className: cls ? cls.name : s.className, classId: cls ? String(cls._id) : null, date: s.date, records: [] });
    groups.get(key).records.push(s);
  }
  const result = [];
  for (const g of groups.values()) {
    if (g.records.length < 2) continue;
    // Hoà cả hai mốc thì so _id — script này XOÁ bản thua, nên phải chọn đúng bản mà sổ
    // lương coi là có hiệu lực (teacherLedger#beats). Không tie-break thì kết quả phụ thuộc
    // thứ tự Mongo trả về, và có thể giữ lại bản KHÁC với bản trang lương đang hiển thị —
    // lúc đó số lương đổi vĩnh viễn theo hướng không ai chủ ý.
    const sorted = [...g.records].sort((a, b) =>
      enteredAt(b) - enteredAt(a)
      || editedAt(b) - editedAt(a)
      || String(b._id || '').localeCompare(String(a._id || '')));
    const [keep, ...remove] = sorted;
    result.push({
      className: g.className, classId: g.classId, date: g.date,
      keep, remove,
      statusConflict: new Set(g.records.map(r => r.status)).size > 1,
    });
  }
  result.sort((a, b) => a.className.localeCompare(b.className) || a.date.localeCompare(b.date));
  return { groups: result, removeIds: result.flatMap(g => g.remove.map(r => String(r._id))) };
}

module.exports = { buildSessionDedupePlan };
