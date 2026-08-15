const router = require('express').Router();
const ctrl = require('../../controllers/studentFeedbackController');
const { permit } = require('../../middlewares/permit');

router.get('/',      permit('studentFeedback.view'), ctrl.getAll);
router.delete('/:id', permit('studentFeedback.delete'), ctrl.remove);

module.exports = router;
