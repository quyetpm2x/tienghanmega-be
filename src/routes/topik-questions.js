const router = require('express').Router();
const TopikQuestion = require('../models/TopikQuestion');
const { success } = require('../utils/response');
const { protect } = require('../middlewares/auth');

router.get('/',    async (req, res) => { success(res, await TopikQuestion.find().sort({ order:1, createdAt:1 })) });
router.post('/',   protect, async (req, res) => { success(res, await TopikQuestion.create(req.body), 'Tạo thành công', 201) });
router.put('/:id', protect, async (req, res) => {
  const doc = await TopikQuestion.findByIdAndUpdate(req.params.id, req.body, { new: true });
  success(res, doc, 'Cập nhật thành công');
});
router.delete('/:id', protect, async (req, res) => {
  await TopikQuestion.findByIdAndDelete(req.params.id);
  success(res, null, 'Xóa thành công');
});
module.exports = router;
