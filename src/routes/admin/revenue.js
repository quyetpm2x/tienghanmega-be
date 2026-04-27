const router = require('express').Router();
const ctrl = require('../../controllers/revenueController');

router.get('/', ctrl.getAll);
router.post('/', ctrl.upsert);
router.delete('/:id', ctrl.remove);

module.exports = router;
