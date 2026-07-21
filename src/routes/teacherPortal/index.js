const router = require('express').Router();
const { protectTeacher } = require('../../middlewares/auth');
const ctrl = require('../../controllers/teacherPortalController');
const testCtrl = require('../../controllers/teacherTestController');

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

// Mã giới thiệu của tôi + hoa hồng đã nhận từ những người mình giới thiệu.
router.get('/referrals', ctrl.getMyReferrals);

// Bài kiểm tra: admin tạo phiên (chọn lớp + chọn đề), giáo viên chỉ đặt giờ/
// mở/đóng phiên, xem điểm + bài làm — không được tạo phiên hay đổi đề.
router.get('/test-sessions',              testCtrl.getSessions);
router.get('/test-sessions/:id',          testCtrl.getSession);
router.put('/test-sessions/:id',          testCtrl.updateSession);
router.put('/test-sessions/:id/close',    testCtrl.closeSession);
router.put('/test-sessions/:id/reopen',   testCtrl.reopenSession);
router.get('/test-sessions/:id/results',  testCtrl.getSessionResults);
router.put('/test-sessions/:id/disqualify', testCtrl.setDisqualified);
router.get('/test-attempts/:attemptId',   testCtrl.getAttemptDetail);
router.put('/test-attempts/:attemptId/grade', testCtrl.gradeAttempt);

module.exports = router;
