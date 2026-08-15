const router = require('express').Router();
const ctrl = require('../../controllers/attendanceController');
const { permit } = require('../../middlewares/permit');

// TeacherSession — dùng chung cho tab "Điểm danh" của Lớp học và tab "Buổi dạy"
// của Giảng viên, nên gắn theo nhóm quyền teachers.*session (xem adminPermissions.js).
router.get('/', permit('teachers.viewSchedule'), ctrl.getAll);
router.post('/', permit('teachers.createSession'), ctrl.create);
router.put('/:id', permit('teachers.updateSession'), ctrl.update);
router.delete('/:id', permit('teachers.deleteSession'), ctrl.remove);

module.exports = router;
