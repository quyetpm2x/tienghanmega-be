const router = require('express').Router();
const Story = require('../models/Story');
const { success } = require('../utils/response');
const { protect } = require('../middlewares/auth');

router.get('/',    async (req, res) => { success(res, await Story.find().sort({ order:1, createdAt:1 })) });
router.post('/',   protect, async (req, res) => { success(res, await Story.create(req.body), 'Tạo thành công', 201) });
router.put('/:id', protect, async (req, res) => {
  const doc = await Story.findByIdAndUpdate(req.params.id, req.body, { new: true });
  success(res, doc, 'Cập nhật thành công');
});
router.delete('/:id', protect, async (req, res) => {
  await Story.findByIdAndDelete(req.params.id);
  success(res, null, 'Xóa thành công');
});

module.exports = router;
