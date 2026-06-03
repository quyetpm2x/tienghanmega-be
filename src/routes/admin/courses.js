const router = require('express').Router();
const Course = require('../../models/Course');
const ctrl = require('../../controllers/courseController');
const { success } = require('../../utils/response');

// GET all — no isActive filter (admin sees everything)
router.get('/', async (req, res) => {
  const courses = await Course.find().sort({ slug: 1 });
  success(res, courses);
});

router.post('/',   ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
