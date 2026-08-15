const router = require('express').Router();
const Vocab = require('../models/Vocab');
const { success } = require('../utils/response');
const { protect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');
const AppError = require('../utils/AppError');

const GAME_TYPES = ['flashcard', 'matching', 'speed', 'fill'];

// Không truyền gameType = trả về tất cả (giữ tương thích ngược cho bất kỳ nơi nào
// lỡ gọi không kèm filter) — FE (trang /games lẫn admin) luôn truyền kèm gameType.
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.gameType) filter.gameType = req.query.gameType;
  success(res, await Vocab.find(filter).sort({ order: 1, createdAt: 1 }));
});

router.post('/', protect, permit('games.create'), async (req, res) => { success(res, await Vocab.create(req.body), 'Tạo thành công', 201) });

// Thêm/import hàng loạt — dùng chung cho luồng "thêm nhiều từ qua form" và "import
// Excel" ở trang admin. Bỏ qua item thiếu kr/vn/rom thay vì chặn cả lô.
router.post('/bulk', protect, permit('games.create'), async (req, res, next) => {
  const { gameType, items } = req.body;
  if (!GAME_TYPES.includes(gameType)) return next(new AppError('gameType không hợp lệ', 400));
  if (!Array.isArray(items) || items.length === 0) return next(new AppError('Danh sách từ trống', 400));

  const valid = items.filter(i => i && String(i.kr || '').trim() && String(i.vn || '').trim() && String(i.rom || '').trim());
  const skipped = items.length - valid.length;
  if (valid.length === 0) return next(new AppError('Không có dòng nào hợp lệ (thiếu tiếng Hàn/phiên âm/nghĩa)', 400));

  const docs = await Vocab.insertMany(valid.map(i => ({
    kr: String(i.kr).trim(), vn: String(i.vn).trim(), rom: String(i.rom).trim(),
    order: Number(i.order) || 0, gameType,
  })));
  success(res, { inserted: docs.length, skipped }, 'Đã thêm từ vựng');
});

router.put('/:id', protect, permit('games.update'), async (req, res) => {
  const doc = await Vocab.findByIdAndUpdate(req.params.id, req.body, { new: true });
  success(res, doc, 'Cập nhật thành công');
});
router.delete('/:id', protect, permit('games.delete'), async (req, res) => {
  await Vocab.findByIdAndDelete(req.params.id);
  success(res, null, 'Xóa thành công');
});

module.exports = router;
