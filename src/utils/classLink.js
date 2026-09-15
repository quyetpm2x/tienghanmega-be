const Class = require('../models/Class');

// Lớp ở trang Lớp học là GỐC; bản ghi (điểm danh, buổi dạy, thưởng/phạt) nối với lớp bằng
// classId. Tên lớp trên bản ghi chỉ để hiển thị. Bản ghi cũ chưa được bổ sung classId thì
// tạm so theo tên — nhờ vậy code mới chạy đúng cả trước và sau khi chạy script bổ sung
// (scripts/backfill-class-ids.js). Bản FE: tienhanmega-fe/lib/classLink.ts (phải giống hệt).
function belongsToClass(record, cls) {
  if (!record || !cls) return false;
  if (record.classId) return String(record.classId) === String(cls._id);
  return record.className === cls.name;
}

// Điều kiện Mongo lấy bản ghi thuộc một tập lớp (cùng quy tắc belongsToClass).
function recordsOfClassesFilter(classes) {
  return {
    $or: [
      { classId: { $in: classes.map(c => c._id) } },
      { classId: null, className: { $in: classes.map(c => c.name) } },
    ],
  };
}

// Tra lớp gốc từ body: ưu tiên classId, không có thì theo tên (client cũ). null = không thấy.
async function resolveClass({ classId, className }, select = '_id name teacherId') {
  if (classId) return Class.findById(classId).select(select);
  if (className) return Class.findOne({ name: className }).select(select);
  return null;
}

module.exports = { belongsToClass, recordsOfClassesFilter, resolveClass };
