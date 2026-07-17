const router = require('express').Router();
const ctrl = require('../../controllers/studentAccountController');

// Cố tình không có route DELETE — chỉ được khoá tài khoản (PUT isActive=false).
router.get('/',        ctrl.getAll);
router.post('/',       ctrl.create);
router.put('/:id/reset-password', ctrl.resetPassword);
router.put('/:id',     ctrl.update);

module.exports = router;
