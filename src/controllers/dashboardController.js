const Student = require('../models/Student');
const Class = require('../models/Class');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');

exports.getStats = async (req, res) => {
  // Tháng hiện tại dạng "2026-06"
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [totalStudents, activeClasses, newRegistrations, revenues] = await Promise.all([
    Student.countDocuments({ status: 'active' }),           // chỉ học sinh đang học
    Class.countDocuments({ status: 'active' }),
    Registration.countDocuments({ status: 'new' }),
    Revenue.find().sort({ month: -1 }).limit(1),            // tháng gần nhất theo month field
  ]);

  const latestRevenue = revenues[0] || null;

  success(res, {
    totalStudents,
    activeClasses,
    newRegistrations,
    monthRevenue:   latestRevenue?.revenue   || 0,
    monthTarget:    latestRevenue?.target    || 0,
    monthCollected: latestRevenue?.collected || 0,
    monthLabel:     latestRevenue?.month     || currentMonth,
    currentMonth,
  });
};
