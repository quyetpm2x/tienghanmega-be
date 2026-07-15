const Class = require('../models/Class');
const Student = require('../models/Student');
const { success } = require('../utils/response');

const dayLabel = (days) => (days || '').split(',').map(s => s.trim()).filter(Boolean).join('–');

exports.getAll = async (req, res) => {
  // showOnSchedule now defaults to false — chỉ lớp được admin bật rõ ràng mới hiện ở
  // homepage, nên chỉ khớp showOnSchedule === true (không dùng $ne:false nữa).
  const classes = await Class.find({ status: 'upcoming', showOnSchedule: true }).sort({ startDate: 1 });

  // Classes with an explicit scheduleOrder come first (ascending), keeping their
  // relative startDate order among themselves; unordered ones keep their startDate order.
  classes.sort((a, b) => {
    if (a.scheduleOrder != null && b.scheduleOrder != null) return a.scheduleOrder - b.scheduleOrder;
    if (a.scheduleOrder != null) return -1;
    if (b.scheduleOrder != null) return 1;
    return 0;
  });

  // Class.enrolled is a manually-edited field that easily goes stale — count real
  // Student records instead, same as the admin class list already does.
  const enrolledCounts = await Student.aggregate([
    { $match: { className: { $in: classes.map(c => c.name) } } },
    { $group: { _id: '$className', count: { $sum: 1 } } },
  ]);
  const enrolledMap = Object.fromEntries(enrolledCounts.map(e => [e._id, e.count]));

  const monthMap = new Map();
  classes.forEach(c => {
    const d = new Date(c.startDate);
    if (!c.startDate || isNaN(d.getTime())) return;
    const monthKey = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
    const enrolled = enrolledMap[c.name] || 0;
    monthMap.get(monthKey).push({
      name: c.course,
      date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
      days: dayLabel(c.days),
      time: c.time,
      slots: Math.max(0, (c.capacity || 0) - enrolled),
      promo: c.promo || '',
    });
  });
  const result = Array.from(monthMap.entries()).map(([month, courses]) => ({ month, courses }));
  success(res, result);
};
