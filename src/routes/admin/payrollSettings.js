const router = require('express').Router();
const ctrl = require('../../controllers/payrollSettingsController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('teachers.viewSalary'), ctrl.get);
router.put('/', permit('teachers.configPayroll'), ctrl.update);

module.exports = router;
