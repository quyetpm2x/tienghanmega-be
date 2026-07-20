const router = require('express').Router();
const ctrl = require('../../controllers/testController');

router.get('/',                ctrl.getAll);
router.get('/by-class/:classId', ctrl.getByClass);
router.get('/:id',             ctrl.getOne);
router.post('/',               ctrl.create);
router.put('/:id',             ctrl.update);
router.delete('/:id',          ctrl.remove);
router.post('/:id/assign',     ctrl.assignClass);
router.post('/:id/unassign',   ctrl.unassignClass);

module.exports = router;
