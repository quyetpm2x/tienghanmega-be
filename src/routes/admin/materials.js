const router = require('express').Router();
const ctrl = require('../../controllers/materialController');
const { permit } = require('../../middlewares/permit');

router.get('/',           permit('materials.view'), ctrl.adminGetAll);
router.post('/',          permit('materials.create'), ctrl.create);
router.put('/reorder',    permit('materials.reorder'), ctrl.reorder);
router.put('/:id',        permit('materials.update'), ctrl.update);
router.delete('/:id',     permit('materials.delete'), ctrl.remove);

module.exports = router;
