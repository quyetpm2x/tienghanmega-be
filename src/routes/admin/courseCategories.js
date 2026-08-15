const router = require('express').Router();
const ctrl = require('../../controllers/courseCategoryController');
const { permit } = require('../../middlewares/permit');

router.get('/',       permit('courses.view'), ctrl.getAll);
router.post('/',      permit('courses.categoryCreate'), ctrl.create);
router.put('/:id',    permit('courses.categoryUpdate'), ctrl.update);
router.delete('/:id', permit('courses.categoryDelete'), ctrl.remove);

module.exports = router;
