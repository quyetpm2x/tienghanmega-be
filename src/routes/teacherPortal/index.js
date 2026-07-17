const router = require('express').Router();
const { protectTeacher } = require('../../middlewares/auth');
const ctrl = require('../../controllers/teacherPortalController');

// All teacher-portal routes require a teacher (not admin) token.
router.use(protectTeacher);

router.get('/classes', ctrl.getMyClasses);
router.get('/classes/:id', ctrl.getMyClass);
router.get('/classes/:id/students', ctrl.getClassStudents);
router.get('/students', ctrl.getMyStudents);
router.put('/students/:id', ctrl.updateMyStudent);
router.get('/student-accounts', ctrl.getMyStudentAccounts);
router.post('/student-accounts', ctrl.createMyStudentAccount);
router.put('/student-accounts/:id/reset-password', ctrl.resetMyStudentAccountPassword);
router.put('/student-accounts/:id', ctrl.updateMyStudentAccount);
router.get('/attendance', ctrl.getMyAttendance);
router.post('/attendance', ctrl.createAttendance);
router.put('/attendance/:id', ctrl.updateAttendance);

module.exports = router;
