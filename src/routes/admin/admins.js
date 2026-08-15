const router = require('express').Router();
const ctrl = require('../../controllers/adminManagementController');
const { superAdminOnly } = require('../../middlewares/permit');

// Toàn bộ route ở đây chỉ super_admin mới vào được — protect(admin) đã áp dụng
// ở routes/admin/index.js, superAdminOnly siết thêm 1 lớp nữa.
router.use(superAdminOnly);

router.get('/', ctrl.getAll);
router.get('/permission-catalog', ctrl.getPermissionCatalog);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
