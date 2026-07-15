const router = require('express').Router();
const { login, me, changePassword, teacherLogin, teacherMe, changeTeacherPassword } = require('../controllers/authController');
const { protect, protectTeacher } = require('../middlewares/auth');

router.post('/login', login);
router.get('/me', protect, me);
router.post('/change-password', protect, changePassword);

router.post('/teacher-login', teacherLogin);
router.get('/teacher-me', protectTeacher, teacherMe);
router.post('/teacher-change-password', protectTeacher, changeTeacherPassword);

module.exports = router;
