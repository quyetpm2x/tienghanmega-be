const router = require('express').Router();
const ctrl = require('../../controllers/affiliateController');
const { permit } = require('../../middlewares/permit');

router.get('/commissions', permit('affiliate.viewCommissions'), ctrl.getAll);
router.put('/commissions/:id/mark-paid', permit('affiliate.updateCommissions'), ctrl.markPaid);
router.put('/commissions/:id/mark-unpaid', permit('affiliate.updateCommissions'), ctrl.markUnpaid);

module.exports = router;
