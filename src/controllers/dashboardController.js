const Student = require('../models/Student');
const Class = require('../models/Class');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const { success } = require('../utils/response');

exports.getStats = async (req, res) => {
  const [totalStudents, activeClasses, newRegistrations, revenues] = await Promise.all([
    Student.countDocuments(),
    Class.countDocuments({ status: 'active' }),
    Registration.countDocuments({ status: 'new' }),
    Revenue.find().sort({ createdAt: -1 }).limit(1),
  ]);

  const latestRevenue = revenues[0] || null;

  success(res, {
    totalStudents,
    activeClasses,
    newRegistrations,
    monthRevenue: latestRevenue?.revenue || 0,
    monthTarget: latestRevenue?.target || 0,
    monthCollected: latestRevenue?.collected || 0,
    monthLabel: latestRevenue?.month || '',
  });
};
