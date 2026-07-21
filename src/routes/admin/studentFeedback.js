const router = require('express').Router();
const ctrl = require('../../controllers/studentFeedbackController');

router.get('/',      ctrl.getAll);
router.delete('/:id', ctrl.remove);

module.exports = router;
