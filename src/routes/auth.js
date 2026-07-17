const router = require('express').Router();
const {
  login, me, changePassword,
  teacherLogin, teacherMe, changeTeacherPassword,
  studentLogin, studentMe, changeStudentPassword,
} = require('../controllers/authController');
const { protect, protectTeacher, protectStudent } = require('../middlewares/auth');

router.post('/login', login);
router.get('/me', protect, me);
router.post('/change-password', protect, changePassword);

router.post('/teacher-login', teacherLogin);
router.get('/teacher-me', protectTeacher, teacherMe);
router.post('/teacher-change-password', protectTeacher, changeTeacherPassword);

router.post('/student-login', studentLogin);
router.get('/student-me', protectStudent, studentMe);
router.post('/student-change-password', protectStudent, changeStudentPassword);

module.exports = router;
