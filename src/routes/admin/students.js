const router = require('express').Router();
const ctrl = require('../../controllers/studentController');

router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/transfer', ctrl.transfer);
router.get('/:id/payments', ctrl.getPayments);
router.post('/:id/payments', ctrl.addPayment);

module.exports = router;
