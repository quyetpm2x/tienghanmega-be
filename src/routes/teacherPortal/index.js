const router = require('express').Router();
const { protectTeacher } = require('../../middlewares/auth');
const ctrl = require('../../controllers/teacherPortalController');

// All teacher-portal routes require a teacher (not admin) token.
router.use(protectTeacher);

router.get('/classes', ctrl.getMyClasses);
router.get('/classes/:id', ctrl.getMyClass);
router.get('/classes/:id/students', ctrl.getClassStudents);
router.get('/attendance', ctrl.getMyAttendance);
router.post('/attendance', ctrl.createAttendance);
router.put('/attendance/:id', ctrl.updateAttendance);

module.exports = router;
