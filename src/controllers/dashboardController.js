const Student = require('../models/Student');
const Class = require('../models/Class');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');

exports.getStats = async (req, res) => {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthFrom = `${currentMonth}-01`
  const monthTo   = `${currentMonth}-31`

  const [totalStudents, activeClasses, newRegistrations, currentMonthStudents, targetRecord] = await Promise.all([
    Student.countDocuments({ status: 'active' }),
    Class.countDocuments({ status: 'active' }),
    Registration.countDocuments({ status: 'new' }),
    // Tính doanh thu từ Student (giống getSummary) — học sinh có startDate trong tháng hiện tại
    Student.find({
      status: { $nin: ['dropped'] },
      startDate: { $gte: monthFrom, $lte: monthTo },
      $or: [{ coursePrice: { $gt: 0 } }, { amount: { $gt: 0 } }],
    }).select('coursePrice amount'),
    // Target vẫn lấy từ Revenue collection
    Revenue.findOne({ month: currentMonth }).select('target'),
  ]);

  const monthRevenue   = currentMonthStudents.reduce((s, s2) => s + ((s2.coursePrice || 0) > 0 ? s2.coursePrice : (s2.amount || 0)), 0)
  const monthCollected = currentMonthStudents.reduce((s, s2) => s + (s2.amount || 0), 0)

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
