const router = require('express').Router();
const ctrl = require('../../controllers/classController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('classes.view'), ctrl.getAll);
router.get('/:id', permit('classes.viewDetail'), ctrl.getOne);
router.post('/', permit('classes.create'), ctrl.create);
router.put('/:id', permit('classes.update'), ctrl.update);
router.put('/:id/transfer-teacher', permit('classes.transferTeacher'), ctrl.transferTeacher);
router.put('/:id/teacher-assignment-date', permit('classes.editTransferDate'), ctrl.updateTeacherAssignmentDate);
router.put('/:id/undo-teacher-transfer', permit('classes.undoTransfer'), ctrl.undoTeacherTransfer);
router.put('/:id/correct-assignment-teacher', permit('classes.correctAssignmentTeacher'), ctrl.correctAssignmentTeacher);
router.delete('/:id', permit('classes.delete'), ctrl.remove);

module.exports = router;
