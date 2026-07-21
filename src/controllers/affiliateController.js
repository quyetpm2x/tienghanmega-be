const ReferralCommission = require('../models/ReferralCommission');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

// Admin-only: quản lý hoa hồng giới thiệu (affiliate) — xem/lọc danh sách các
// giao dịch hoa hồng đã phát sinh tự động (studentController.maybeCreateCommission)
// và đánh dấu đã trả cho người giới thiệu.
exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.referrerModel) filter.referrerModel = req.query.referrerModel;
  const commissions = await ReferralCommission.find(filter)
    .populate('referrerId', 'name')
    .populate('referredStudentId', 'name')
    .sort({ createdAt: -1 });
  success(res, commissions);
};

exports.markPaid = async (req, res, next) => {
  const commission = await ReferralCommission.findById(req.params.id);
  if (!commission) return next(new AppError('Không tìm thấy giao dịch hoa hồng', 404));
  commission.status = 'paid';
  commission.paidAt = new Date();
  await commission.save();
  success(res, commission, 'Đã đánh dấu trả hoa hồng');
};

exports.markUnpaid = async (req, res, next) => {
  const commission = await ReferralCommission.findById(req.params.id);
  if (!commission) return next(new AppError('Không tìm thấy giao dịch hoa hồng', 404));
  commission.status = 'pending';
  commission.paidAt = null;
  await commission.save();
  success(res, commission, 'Đã chuyển về chưa trả');
};
