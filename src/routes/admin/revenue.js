const router = require('express').Router();
const ctrl = require('../../controllers/revenueController');

// named routes must be registered before /:id
router.get('/summary',   ctrl.getSummary);
router.get('/breakdown', ctrl.getBreakdown);
router.get('/', ctrl.getAll);
router.post('/', ctrl.upsert);
router.delete('/:id', ctrl.remove);

module.exports = router;
