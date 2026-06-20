const router = require('express').Router();
const ctrl   = require('../../controllers/expenseCategoryController');

router.get('/',       ctrl.getAll);
router.post('/',      ctrl.create);
router.delete('/:id', ctrl.remove);

module.exports = router;
