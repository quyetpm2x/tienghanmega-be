const router = require('express').Router();
const ctrl = require('../../controllers/faqController');
const { permit } = require('../../middlewares/permit');

router.get('/',           permit('faqs.view'), ctrl.getAll);
router.post('/',          permit('faqs.create'), ctrl.create);
router.put('/reorder',    permit('faqs.update'), ctrl.reorder);
router.put('/:id',        permit('faqs.update'), ctrl.update);
router.delete('/:id',     permit('faqs.delete'), ctrl.remove);

module.exports = router;
