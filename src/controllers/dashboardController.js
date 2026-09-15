const Student = require('../models/Student');
const Class = require('../models/Class');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');
const { aggregateByMonth, vnDateStr } = require('../utils/revenueModel');
const { loadPackageData } = require('./revenueController');

exports.getStats = async (req, res) => {
  // Tháng hiện tại theo giờ VN — server có thể chạy UTC, đầu tháng sẽ lệch sang tháng trước.
  const currentMonth = vnDateStr(new Date()).slice(0, 7);
  const [year, mo] = currentMonth.split('-').map(Number);
  const monthFrom = `${currentMonth}-01`;
  // Ngày cuối tháng THẬT — "-31" cứng làm tháng 2 và các tháng 30 ngày lấy sai khoảng.
  const monthTo = `${currentMonth}-${String(new Date(Date.UTC(year, mo, 0)).getUTCDate()).padStart(2, '0')}`;

  const [totalStudents, activeClasses, newRegistrations, targetRecord, { packages, facts }] = await Promise.all([
    // status học sinh tự suy từ ghi danh (còn học ít nhất một khoá) nên vẫn đếm NGƯỜI.
    Student.countDocuments({ status: 'active' }),
    Class.countDocuments({ status: 'active' }),
    Registration.countDocuments({ status: 'new' }),
    Revenue.findOne({ month: currentMonth }).select('target').lean(),
    loadPackageData(),
  ]);

  // Cùng quy tắc với trang Doanh thu: doanh thu ghi nhận và đã đóng của nhóm gói chốt
  // trong tháng này.
  const month = aggregateByMonth(packages, facts, { from: monthFrom, to: monthTo })[currentMonth]
    || { revenue: 0, collected: 0 };

  success(res, {
    totalStudents,
    activeClasses,
    newRegistrations,
    monthRevenue: month.revenue,
    monthTarget: targetRecord?.target || 0,
    monthCollected: month.collected,
    monthLabel: currentMonth,
    currentMonth,
  });
};
