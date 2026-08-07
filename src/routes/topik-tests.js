const router = require('express').Router();
const TopikTest = require('../models/TopikTest');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');
const { protect } = require('../middlewares/auth');

// Public: 1 đề đang active, chọn ngẫu nhiên nếu có nhiều đề — trả null nếu chưa có đề
// nào (frontend fallback về placeholder "sắp ra mắt").
router.get('/active', async (req, res) => {
  const actives = await TopikTest.find({ isActive: true }).populate('questions.questionId');
  if (actives.length === 0) return success(res, null);
  const picked = actives[Math.floor(Math.random() * actives.length)];
  success(res, picked);
});

// Admin
router.get('/', protect, async (req, res) => {
  success(res, await TopikTest.find().sort({ createdAt: -1 }).populate('questions.questionId'));
});
router.get('/:id', protect, async (req, res, next) => {
  const test = await TopikTest.findById(req.params.id).populate('questions.questionId');
  if (!test) return next(new AppError('Không tìm thấy đề thi', 404));
  success(res, test);
});
router.post('/', protect, async (req, res) => {
  success(res, await TopikTest.create(req.body), 'Tạo đề thi thành công', 201);
});
router.put('/:id', protect, async (req, res, next) => {
  const test = await TopikTest.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('questions.questionId');
  if (!test) return next(new AppError('Không tìm thấy đề thi', 404));
  success(res, test, 'Cập nhật thành công');
});
router.delete('/:id', protect, async (req, res, next) => {
  const test = await TopikTest.findByIdAndDelete(req.params.id);
  if (!test) return next(new AppError('Không tìm thấy đề thi', 404));
  success(res, null, 'Xóa thành công');
});

module.exports = router;
