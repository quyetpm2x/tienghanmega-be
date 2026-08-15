const router = require('express').Router();
const ctrl = require('../../controllers/studentAccountController');
const { permit } = require('../../middlewares/permit');

// Cố tình không có route DELETE — chỉ được khoá tài khoản (PUT isActive=false).
router.get('/',        permit('students.manageAccount'), ctrl.getAll);
router.post('/',       permit('students.manageAccount'), ctrl.create);
router.put('/:id/reset-password', permit('students.manageAccount'), ctrl.resetPassword);
router.put('/:id',     permit('students.manageAccount'), ctrl.update);

module.exports = router;
