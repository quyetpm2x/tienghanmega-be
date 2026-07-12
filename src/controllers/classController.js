const Class = require('../models/Class');
const Student = require('../models/Student');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const MAX_HOMEPAGE_CLASSES = 5;

// Class.enrolled is a stored field with no code path that keeps it in sync — attach
// the real Student count instead, so every consumer (admin list, edit form, public
// banner) sees the same accurate number.
async function withLiveEnrolled(classNames) {
  const counts = await Student.aggregate([
    { $match: { className: { $in: classNames } } },
    { $group: { _id: '$className', count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(counts.map(c => [c._id, c.count]));
}

exports.getAll = async (req, res) => {
  const { status, showOnHomepage } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (showOnHomepage === 'true') filter.showOnHomepage = true;
  let query = Class.find(filter);
  query = showOnHomepage === 'true' ? query.sort({ homepageOrder: 1 }).limit(MAX_HOMEPAGE_CLASSES) : query.sort({ startDate: -1 });
  const classes = await query;

  // Classes pinned with an explicit adminOrder come first (ascending); everything
  // else keeps the default startDate-desc order — mirrors the schedule/banner ordering.
  if (showOnHomepage !== 'true') {
    classes.sort((a, b) => {
      const ao = a.adminOrder;
      const bo = b.adminOrder;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return 0;
    });
  }

  const enrolledMap = await withLiveEnrolled(classes.map(c => c.name));
  success(res, classes.map(c => ({ ...c.toObject(), enrolled: enrolledMap[c.name] || 0 })));
};

exports.getOne = async (req, res, next) => {
  const cls = await Class.findById(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  const enrolledMap = await withLiveEnrolled([cls.name]);
  success(res, { ...cls.toObject(), enrolled: enrolledMap[cls.name] || 0 });
};

exports.create = async (req, res, next) => {
  if (req.body.showOnHomepage) {
    const count = await Class.countDocuments({ showOnHomepage: true });
    if (count >= MAX_HOMEPAGE_CLASSES) return next(new AppError('Đã đạt tối đa 5 lớp hiển thị banner homepage', 400));
  }
  const cls = await Class.create(req.body);
  success(res, cls, 'Tạo lớp học thành công', 201);
};

exports.update = async (req, res, next) => {
  if (req.body.showOnHomepage) {
    const existing = await Class.findById(req.params.id);
    if (!existing) return next(new AppError('Không tìm thấy lớp học', 404));
    if (!existing.showOnHomepage) {
      const count = await Class.countDocuments({ showOnHomepage: true, _id: { $ne: req.params.id } });
      if (count >= MAX_HOMEPAGE_CLASSES) return next(new AppError('Đã đạt tối đa 5 lớp hiển thị banner homepage', 400));
    }
  }
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, cls, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const cls = await Class.findByIdAndDelete(req.params.id);
  if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
  success(res, null, 'Xóa thành công');
};
