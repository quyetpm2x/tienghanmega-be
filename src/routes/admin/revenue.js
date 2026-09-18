const router = require('express').Router();
const ctrl = require('../../controllers/revenueController');
const { permit } = require('../../middlewares/permit');

// named routes must be registered before /:id
router.get('/summary',   permit('finance.viewOverview'), ctrl.getSummary);
router.get('/breakdown', permit('finance.viewOverview'), ctrl.getBreakdown);
router.get('/series',    permit('finance.viewRevenue'), ctrl.getSeries);
router.get('/daily',     permit('finance.viewRevenue'), ctrl.getDaily);
router.get('/payments',      permit('finance.viewRevenue'), ctrl.getPaymentList);
router.get('/closed-students', permit('finance.viewRevenue'), ctrl.getClosedStudentList);
router.get('/debts',         permit('finance.viewRevenue'), ctrl.getDebtList);
router.get('/', permit('finance.viewRevenue'), ctrl.getAll);
router.post('/', permit('finance.viewRevenue'), ctrl.upsert);
router.delete('/:id', permit('finance.viewRevenue'), ctrl.remove);

module.exports = router;
