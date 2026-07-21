const router = require('express').Router();
const ctrl = require('../controllers/teacherController');
const { protect, optionalProtect } = require('../middlewares/auth');

router.get('/', optionalProtect, ctrl.getAll);
router.get('/:id', optionalProtect, ctrl.getOne);
router.post('/', protect, ctrl.create);
router.put('/:id', protect, ctrl.update);
router.delete('/:id', protect, ctrl.remove);
router.post('/:id/referral-code', protect, ctrl.generateReferralCode);

module.exports = router;
