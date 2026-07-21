const router = require('express').Router();
const ctrl = require('../../controllers/affiliateController');

router.get('/commissions', ctrl.getAll);
router.put('/commissions/:id/mark-paid', ctrl.markPaid);
router.put('/commissions/:id/mark-unpaid', ctrl.markUnpaid);

module.exports = router;
