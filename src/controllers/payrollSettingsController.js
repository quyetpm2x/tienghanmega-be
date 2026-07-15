const PayrollSettings = require('../models/PayrollSettings');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

async function getOrCreate() {
  let doc = await PayrollSettings.findOne();
  if (!doc) doc = await PayrollSettings.create({});
  return doc;
}

exports.get = async (req, res) => {
  const settings = await getOrCreate();
  success(res, settings);
};

exports.update = async (req, res, next) => {
  const { startDay } = req.body;
  const n = Number(startDay);
  if (!Number.isInteger(n) || n < 1 || n > 28) {
    return next(new AppError('Ngày bắt đầu chu kỳ phải là số nguyên từ 1 đến 28', 400));
  }
  const existing = await getOrCreate();
  existing.startDay = n;
  await existing.save();
  success(res, existing, 'Cập nhật thành công');
};
