const router = require('express').Router();
const ctrl = require('../../controllers/teacherAccountController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('teachers.manageAccount'), ctrl.getAll);
router.post('/', permit('teachers.manageAccount'), ctrl.create);
router.put('/:id/reset-password', permit('teachers.manageAccount'), ctrl.resetPassword);
router.put('/:id', permit('teachers.manageAccount'), ctrl.update);
router.delete('/:id', permit('teachers.manageAccount'), ctrl.remove);

module.exports = router;
