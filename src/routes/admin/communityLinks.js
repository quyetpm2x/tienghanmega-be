const router = require('express').Router();
const ctrl = require('../../controllers/communityLinkController');
const { permit } = require('../../middlewares/permit');

router.get('/',        permit('display.communityView'), ctrl.getAll);
router.post('/',       permit('display.communityCreate'), ctrl.create);
router.put('/reorder', permit('display.communityUpdate'), ctrl.reorder);
router.put('/:id',     permit('display.communityUpdate'), ctrl.update);
router.delete('/:id',  permit('display.communityDelete'), ctrl.remove);

module.exports = router;
