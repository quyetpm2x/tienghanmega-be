const router = require('express').Router();
const ctrl = require('../../controllers/studentAttendanceController');

router.get('/',     ctrl.getAll);
router.post('/',    ctrl.create);
router.put('/:id',  ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
