const router = require('express').Router();
const ctrl = require('../../controllers/teacherPaymentController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('teachers.viewPayroll'), ctrl.getAll);
router.post('/', permit('teachers.recordPayment'), ctrl.upsert);
router.delete('/:id', permit('teachers.recordPayment'), ctrl.remove);

module.exports = router;
