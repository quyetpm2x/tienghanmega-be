const Student = require('../models/Student');
const Payment = require('../models/Payment');
const Class = require('../models/Class');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');

exports.getStats = async (req, res) => {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthFrom = `${currentMonth}-01`
  // Ngày cuối tháng THẬT — "-31" cứng làm tháng 2 và các tháng 30 ngày lấy sai khoảng.
  const monthTo   = `${currentMonth}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
  // Doanh thu cắt tháng theo giờ VN (UTC+7) — xem vnDateStr ở revenueController.
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const vnDateStr = d => new Date(new Date(d).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)

  const [totalStudents, activeClasses, newRegistrations, currentMonthStudents, targetRecord, payments] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Class.countDocuments({ status: 'active' }),
    Registration.countDocuments({ status: 'new' }),
    // Học phí ký mới — học sinh có startDate trong tháng hiện tại (giống getSummary)
    Student.find({
      status: { $nin: ['dropped'] },
      startDate: { $gte: monthFrom, $lte: monthTo },
      $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
    }).select('coursePrice amount'),
    // Target vẫn lấy từ Revenue collection
    Revenue.findOne({ month: currentMonth }).select('target'),
    Payment.find().select('studentId amount paidAt'),
  ]);

  // monthRevenue = HỌC PHÍ KÝ MỚI (theo ngày khai giảng).
  const monthRevenue = currentMonthStudents.reduce((s, s2) => s + ((s2.coursePrice || 0) > 0 ? s2.coursePrice : (s2.amount || 0)), 0)

  // monthCollected = DOANH THU thực nhận trong tháng, theo ngày đóng (giờ VN), cộng phần
  // dự phòng cho học sinh chưa từng có bản ghi Payment (dữ liệu cũ nhập tay — xem getSummary).
  const paidStudentIds = new Set(payments.map(p => String(p.studentId)))
  const monthCollected = payments.reduce((sum, p) => {
    const d = vnDateStr(p.paidAt)
    return d >= monthFrom && d <= monthTo ? sum + (p.amount || 0) : sum
  }, 0) + currentMonthStudents.reduce(
    (sum, s2) => (!paidStudentIds.has(String(s2._id)) && s2.amount > 0 ? sum + s2.amount : sum), 0)

  success(res, {
    totalStudents,
    activeClasses,
    newRegistrations,
    monthRevenue,
    monthTarget:    targetRecord?.target || 0,
    monthCollected,
    monthLabel:     currentMonth,
    currentMonth,
  });
};
