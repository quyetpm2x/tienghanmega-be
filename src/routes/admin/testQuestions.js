const router = require('express').Router();
const ctrl = require('../../controllers/testQuestionController');
const { permit } = require('../../middlewares/permit');

router.get('/',       permit('tests.bankView'), ctrl.getAll);
router.get('/stats',  permit('tests.bankView'), ctrl.getStats);
router.post('/',      permit('tests.bankCreate'), ctrl.create);
router.put('/:id',    permit('tests.bankUpdate'), ctrl.update);
router.delete('/:id', permit('tests.bankDelete'), ctrl.remove);

module.exports = router;
