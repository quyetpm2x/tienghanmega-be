// Nguồn DUY NHẤT để phân loại một khoá từ tên khoá. Trước đây có 2 bản mâu thuẫn:
// studentController xếp "lộ trình" vào topik, revenueController xếp vào bundle —
// khiến loại lưu trên Payment không khớp biểu đồ cơ cấu doanh thu. Giữ đúng quy tắc
// của báo cáo doanh thu (bản đang hiển thị cho admin).
const COURSE_CATEGORIES = ['beginner', 'intermediate', 'topik', 'conversation', 'bundle'];

function categoryOf(title) {
  if (!title) return 'conversation';
  const l = String(title).toLowerCase();
  if (l.includes('lộ trình') || l.includes('lo trinh') || l.includes('combo')) return 'bundle';
  if (l.includes('sơ cấp') || l.includes('so cap')) return 'beginner';
  if (l.includes('trung cấp') || l.includes('trung cap')) return 'intermediate';
  if (l.includes('topik')) return 'topik';
  return 'conversation';
}

module.exports = { categoryOf, COURSE_CATEGORIES };
