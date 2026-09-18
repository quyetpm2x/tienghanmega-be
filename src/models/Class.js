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
  // Lớp chạy nhiều khoá nối tiếp — mỗi giai đoạn có khoá, khoảng ngày và lịch riêng.
  // Rỗng = lớp một khoá như trước (suy từ course/days/time/startDate/endDate). Xem utils/classPhase.js.
  phases: {
    type: [{
      courseTitle: { type: String, required: true },
      courseCategory: { type: String, default: null },
      days: { type: String, required: true },      // "T2,T4,T6"
      time: { type: String, default: '' },         // "19:30 - 21:30"
      fromDate: { type: String, required: true },  // "2026-09-15"
      toDate: { type: String, default: null },
      // Giảng viên của RIÊNG khoá này, kèm lương. Một dòng = một đoạn (ai dạy, từ–đến,
      // bao nhiêu). Hai đoạn trong cùng khoá không chồng ngày — chỉ 1 giảng viên tại 1
      // thời điểm. rate null = dùng Class.ratePerSession. Xem utils/classPhase.js.
      // Rỗng = khoá chưa khai giảng viên, rơi về teacherAssignments cấp lớp như trước.
      teachers: {
        type: [{
          teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
          teacherName: String,
          fromDate: { type: String, required: true },
          toDate: { type: String, default: null },
          rate: { type: Number, default: null },
        }],
        default: [],
      },
    }],
    default: [],
  },
  ratePerSession: { type: Number, default: null },
  // Lương/buổi đổi theo thời gian và theo giảng viên — xem utils/classRate.js.
  // teacherIds rỗng = áp cho mọi giảng viên của lớp; toDate null = áp từ fromDate trở đi.
  // Ngày dạy không nằm trong khoảng nào thì dùng ratePerSession ở trên.
  rateHistory: {
    type: [{
      rate: { type: Number, required: true, min: 1 },
      fromDate: { type: String, required: true },   // "2026-09-01"
      toDate: { type: String, default: null },
      teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }],
      note: { type: String, default: '' },
    }],
    default: [],
  },
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
