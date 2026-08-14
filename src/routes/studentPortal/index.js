const router = require('express').Router();
const { protectStudent } = require('../../middlewares/auth');
const ctrl = require('../../controllers/studentPortalController');
const testCtrl = require('../../controllers/studentTestController');
const hwCtrl = require('../../controllers/studentHomeworkController');
const uploadRouter = require('./upload');

// All student-portal routes require a student (not admin/teacher) token.
router.use(protectStudent);

router.get('/me', ctrl.getMe);

// Phản hồi về giáo viên/lớp đang học — chỉ admin xem được (xem StudentFeedback model).
router.get('/feedback', ctrl.getMyFeedback);
router.put('/feedback', ctrl.submitFeedback);

// Mã giới thiệu của tôi + hoa hồng đã nhận từ những người mình giới thiệu.
router.get('/referrals', ctrl.getMyReferrals);

// Upload ảnh/audio đính kèm câu trả lời tự luận.
router.use('/upload', uploadRouter);

// Bài kiểm tra: xem phiên đang mở, bắt đầu/tiếp tục làm bài, nộp bài, xem lại.
router.get('/test-sessions',                    testCtrl.getMySessions);
router.post('/test-sessions/:sessionId/start',  testCtrl.startAttempt);
router.post('/test-attempts/:attemptId/submit', testCtrl.submitAttempt);
router.put('/test-attempts/:attemptId/save',    testCtrl.saveProgress);
router.post('/test-attempts/:attemptId/tab-switch', testCtrl.reportTabSwitch);
router.get('/test-attempts/:attemptId/review',  testCtrl.getAttemptReview);

// Bài tập về nhà.
router.get('/homework/assignments',              hwCtrl.getAssignments);
router.post('/homework/assignments/:id/start',   hwCtrl.startAssignment);
router.put('/homework/submissions/:id/save',     hwCtrl.saveProgress);
router.post('/homework/submissions/:id/submit',  hwCtrl.submitAssignment);
router.post('/homework/submissions/:id/tab-switch', hwCtrl.reportTabSwitch);
router.post('/homework/submissions/:id/dispute', hwCtrl.sendDispute);
router.get('/homework/submissions/:id',          hwCtrl.getSubmission);
router.get('/homework/notifications',            hwCtrl.getHomeworkNotifications);

module.exports = router;
