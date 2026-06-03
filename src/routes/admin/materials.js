const router = require('express').Router();
const ctrl = require('../../controllers/materialController');

router.get('/',           ctrl.adminGetAll);
router.post('/',          ctrl.create);
router.put('/reorder',    ctrl.reorder);
router.put('/:id',        ctrl.update);
router.delete('/:id',     ctrl.remove);

module.exports = router;
