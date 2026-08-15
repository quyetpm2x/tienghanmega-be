const router = require('express').Router();
const ctrl = require('../../controllers/teacherBonusController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('teachers.viewSalary'), ctrl.getAll);
router.post('/', permit('teachers.createBonus'), ctrl.create);
router.put('/:id', permit('teachers.updateBonus'), ctrl.update);
router.delete('/:id', permit('teachers.deleteBonus'), ctrl.remove);

module.exports = router;
