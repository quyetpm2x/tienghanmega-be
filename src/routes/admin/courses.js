const router = require('express').Router();
const ctrl = require('../../controllers/courseController');
const { permit } = require('../../middlewares/permit');

router.post('/',   permit('courses.create'), ctrl.create);
router.put('/:id', permit('courses.update'), ctrl.update);
router.delete('/:id', permit('courses.delete'), ctrl.remove);

module.exports = router;
