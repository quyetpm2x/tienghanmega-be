const mongoose = require('mongoose');
const { i18nField } = require('../utils/i18nField');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  course: { type: String, required: true },
  teacher: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  days: String,
  time: String,
  capacity: { type: Number, default: 10 },
  enrolled: { type: Number, default: 0 },
  startDate: String,
  endDate: String,
  status: { type: String, enum: ['active', 'upcoming', 'closed'], default: 'upcoming' },
  color: String,
  note: { type: String, default: '' },
  promo: i18nField(),
  showOnHomepage: { type: Boolean, default: false },
  homepageOrder: { type: Number, default: null },
  showOnSchedule: { type: Boolean, default: false },
  scheduleOrder: { type: Number, default: null },
  adminOrder: { type: Number, default: null },
  ratePerSession: { type: Number, default: null },
  // Lịch sử phân công giáo viên theo mốc ngày — để tính lương đúng "giáo viên
  // nào dạy buổi nào" khi lớp đổi giáo viên giữa chừng, thay vì chỉ nhìn
  // teacherId hiện tại và gán nhầm cả các buổi quá khứ cho giáo viên mới.
  // toDate: null nghĩa là đang phụ trách (tới hiện tại). Tự động ghi/đóng bởi
  // classController khi admin đổi trường `teacher` — không sửa tay qua API khác.
  teacherAssignments: {
    type: [{
      teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
      teacherName: String,
      fromDate: String, // "2026-08-14", buổi từ ngày này (bao gồm) tính cho giáo viên này
      toDate: { type: String, default: null }, // "2026-08-13" hoặc null nếu đang phụ trách
    }],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);
