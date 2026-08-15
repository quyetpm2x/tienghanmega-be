const router = require('express').Router();
const ctrl = require('../../controllers/testController');
const { permit } = require('../../middlewares/permit');

router.get('/',                permit('tests.paperView'), ctrl.getAll);
router.get('/by-class/:classId', permit('tests.paperView'), ctrl.getByClass);
router.get('/:id',             permit('tests.paperView'), ctrl.getOne);
router.post('/',               permit('tests.paperCreate'), ctrl.create);
router.post('/quick-generate', permit('tests.paperCreate'), ctrl.quickGenerate);
router.put('/:id',             permit('tests.paperUpdate'), ctrl.update);
router.delete('/:id',          permit('tests.paperDelete'), ctrl.remove);
router.post('/:id/assign',     permit('tests.paperUpdate'), ctrl.assignClass);
router.post('/:id/unassign',   permit('tests.paperUpdate'), ctrl.unassignClass);

module.exports = router;
