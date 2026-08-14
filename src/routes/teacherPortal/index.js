const router = require('express').Router();
const { protectTeacher } = require('../../middlewares/auth');
const ctrl = require('../../controllers/teacherPortalController');
const testCtrl = require('../../controllers/teacherTestController');
const hwCtrl = require('../../controllers/teacherHomeworkController');

// All teacher-portal routes require a teacher (not admin) token.
router.use(protectTeacher);

router.use('/upload', require('./upload'));

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

// Lương/thưởng của chính tôi — chỉ đọc, tính hoàn toàn ở backend.
router.get('/salary', ctrl.getMySalary);

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

// Bài tập về nhà — ngân hàng câu hỏi + đề riêng của giảng viên, giao bài theo
// lớp/buổi học, chấm điểm + phản hồi thắc mắc.
router.get('/homework/questions',        hwCtrl.getQuestions);
router.post('/homework/questions',       hwCtrl.createQuestion);
router.put('/homework/questions/:id',    hwCtrl.updateQuestion);
router.delete('/homework/questions/:id', hwCtrl.deleteQuestion);
router.get('/homework/papers',           hwCtrl.getPapers);
router.post('/homework/papers',          hwCtrl.createPaper);
router.put('/homework/papers/:id',       hwCtrl.updatePaper);
router.delete('/homework/papers/:id',    hwCtrl.deletePaper);
router.get('/homework/assignments',                 hwCtrl.getAssignments);
router.get('/homework/assignments/:id',              hwCtrl.getAssignment);
router.post('/homework/assignments',                 hwCtrl.createAssignment);
router.put('/homework/assignments/:id',              hwCtrl.updateAssignment);
router.delete('/homework/assignments/:id',           hwCtrl.deleteAssignment);
router.get('/homework/assignments/:id/submissions',  hwCtrl.getAssignmentSubmissions);
router.get('/homework/notifications',                hwCtrl.getHomeworkNotifications);
router.put('/homework/submissions/:id/grade',        hwCtrl.gradeSubmission);
router.put('/homework/submissions/:id/dispute-reply', hwCtrl.replyDispute);

module.exports = router;
