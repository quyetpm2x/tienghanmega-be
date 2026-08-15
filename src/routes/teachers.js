const router = require('express').Router();
const ctrl = require('../controllers/teacherController');
const { protect, optionalProtect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');

// GET công khai (trang chủ) — optionalProtect nên KHÔNG gắn permit() (permit() đòi
// hỏi req.admin luôn có, sẽ chặn nhầm khách chưa đăng nhập).
router.get('/', optionalProtect, ctrl.getAll);
router.get('/:id', optionalProtect, ctrl.getOne);
router.post('/', protect, permit('teachers.create'), ctrl.create);
router.put('/:id', protect, permit('teachers.update'), ctrl.update);
router.delete('/:id', protect, permit('teachers.delete'), ctrl.remove);
router.post('/:id/referral-code', protect, permit('teachers.generateReferral'), ctrl.generateReferralCode);

module.exports = router;
