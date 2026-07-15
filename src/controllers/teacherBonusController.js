const TeacherBonus = require('../models/TeacherBonus');
const Class = require('../models/Class');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

exports.getAll = async (req, res) => {
  const { teacherId, from, to } = req.query;
  const filter = {};
  if (teacherId) filter.teacherId = teacherId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const bonuses = await TeacherBonus.find(filter).sort({ date: -1 });
  success(res, bonuses);
};

exports.create = async (req, res, next) => {
  const { teacherId, type, amount, date, classId, note } = req.body;
  if (!teacherId || !type || !amount || !date) return next(new AppError('Thiếu thông tin bắt buộc', 400));

  let className = '';
  if (classId) {
    const cls = await Class.findById(classId).select('name');
    if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
    className = cls.name;
  }

  const bonus = await TeacherBonus.create({ teacherId, type, amount, date, classId: classId || null, className, note: note || '' });
  success(res, bonus, 'Thêm thành công', 201);
};

exports.update = async (req, res, next) => {
  const { type, amount, date, classId, note } = req.body;
  const body = {};
  if (type !== undefined) body.type = type;
  if (amount !== undefined) body.amount = amount;
  if (date !== undefined) body.date = date;
  if (note !== undefined) body.note = note;
  if (classId !== undefined) {
    body.classId = classId || null;
    if (classId) {
      const cls = await Class.findById(classId).select('name');
      if (!cls) return next(new AppError('Không tìm thấy lớp học', 404));
      body.className = cls.name;
    } else {
      body.className = '';
    }
  }

  const bonus = await TeacherBonus.findByIdAndUpdate(req.params.id, body, { new: true });
  if (!bonus) return next(new AppError('Không tìm thấy khoản thưởng/phạt', 404));
  success(res, bonus, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const bonus = await TeacherBonus.findByIdAndDelete(req.params.id);
  if (!bonus) return next(new AppError('Không tìm thấy khoản thưởng/phạt', 404));
  success(res, null, 'Đã xoá');
};
