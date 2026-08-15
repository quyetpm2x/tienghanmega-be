const router = require('express').Router();
const ctrl = require('../../controllers/studentController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('students.view'), ctrl.getAll);
router.get('/:id', permit('students.viewDetail'), ctrl.getOne);
router.post('/', permit('students.create'), ctrl.create);
router.put('/:id', permit('students.update'), ctrl.update);
router.delete('/:id', permit('students.delete'), ctrl.remove);
router.post('/:id/transfer', permit('students.transfer'), ctrl.transfer);
router.get('/:id/payments', permit('students.viewPayments'), ctrl.getPayments);
router.post('/:id/payments', permit('students.addPayment'), ctrl.addPayment);
router.post('/:id/referral-code', permit('students.generateReferral'), ctrl.generateReferralCode);

module.exports = router;
