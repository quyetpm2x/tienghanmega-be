const router = require('express').Router();
const PlacementTest = require('../models/PlacementTest');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { protect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');

// Không có route /active public — khác topik-tests.js — vì tính năng này
// không có trang public tự do, mọi lượt làm bài đều gắn 1 phiên do admin tạo.
router.get('/', protect, permit('tests.placementView'), async (req, res) => {
  success(res, await PlacementTest.find().sort({ createdAt: -1 }).populate('questions.questionId'));
});
router.get('/:id', protect, permit('tests.placementView'), async (req, res, next) => {
  const test = await PlacementTest.findById(req.params.id).populate('questions.questionId');
  if (!test) return next(new AppError('Không tìm thấy đề test', 404));
  success(res, test);
});
router.post('/', protect, permit('tests.placementCreate'), async (req, res) => {
  success(res, await PlacementTest.create(req.body), 'Tạo đề test thành công', 201);
});
router.put('/:id', protect, permit('tests.placementUpdate'), async (req, res, next) => {
  const test = await PlacementTest.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('questions.questionId');
  if (!test) return next(new AppError('Không tìm thấy đề test', 404));
  success(res, test, 'Cập nhật thành công');
});
router.delete('/:id', protect, permit('tests.placementDelete'), async (req, res, next) => {
  const test = await PlacementTest.findByIdAndDelete(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề test', 404));
  success(res, null, 'Xóa thành công');
});

module.exports = router;
