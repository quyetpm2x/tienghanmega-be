const router = require('express').Router();
const ctrl = require('../../controllers/feedbackImageController');
const { permit } = require('../../middlewares/permit');

router.get('/',        permit('display.feedbackView'), ctrl.getAll);
router.post('/',       permit('display.feedbackCreate'), ctrl.create);
router.put('/reorder', permit('display.feedbackUpdate'), ctrl.reorder);
router.put('/:id',     permit('display.feedbackUpdate'), ctrl.update);
router.delete('/:id',  permit('display.feedbackDelete'), ctrl.remove);

module.exports = router;
