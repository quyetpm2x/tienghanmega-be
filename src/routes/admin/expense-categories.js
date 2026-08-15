const router = require('express').Router();
const ctrl   = require('../../controllers/expenseCategoryController');
const { permit } = require('../../middlewares/permit');

router.get('/',       permit('finance.viewExpenses'), ctrl.getAll);
router.post('/',      permit('finance.createExpense'), ctrl.create);
router.delete('/:id', permit('finance.deleteExpense'), ctrl.remove);

module.exports = router;
