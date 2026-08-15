const router = require('express').Router();
const ctrl = require('../../controllers/successVideoController');
const { permit } = require('../../middlewares/permit');

router.get('/',       permit('display.storiesView'), ctrl.getAll);
router.post('/',      permit('display.storiesCreate'), ctrl.create);
router.put('/:id',    permit('display.storiesUpdate'), ctrl.update);
router.delete('/:id', permit('display.storiesDelete'), ctrl.remove);

module.exports = router;
