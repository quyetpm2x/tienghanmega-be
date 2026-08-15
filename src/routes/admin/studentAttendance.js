const router = require('express').Router();
const ctrl = require('../../controllers/studentAttendanceController');
const { permit } = require('../../middlewares/permit');

router.get('/',     permit('attendance.view'), ctrl.getAll);
router.post('/',    permit('attendance.record'), ctrl.create);
router.put('/:id',  permit('attendance.update'), ctrl.update);
router.delete('/:id', permit('attendance.update'), ctrl.remove);

module.exports = router;
