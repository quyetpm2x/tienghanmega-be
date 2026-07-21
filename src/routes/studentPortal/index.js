const router = require('express').Router();
const { protectStudent } = require('../../middlewares/auth');
const ctrl = require('../../controllers/studentPortalController');
const testCtrl = require('../../controllers/studentTestController');
const uploadRouter = require('./upload');

// All student-portal routes require a student (not admin/teacher) token.
router.use(protectStudent);

router.get('/me', ctrl.getMe);

// Upload ảnh/audio đính kèm câu trả lời tự luận.
router.use('/upload', uploadRouter);

// Bài kiểm tra: xem phiên đang mở, bắt đầu/tiếp tục làm bài, nộp bài, xem lại.
router.get('/test-sessions',                    testCtrl.getMySessions);
router.post('/test-sessions/:sessionId/start',  testCtrl.startAttempt);
router.post('/test-attempts/:attemptId/submit', testCtrl.submitAttempt);
router.put('/test-attempts/:attemptId/save',    testCtrl.saveProgress);
router.post('/test-attempts/:attemptId/tab-switch', testCtrl.reportTabSwitch);
router.get('/test-attempts/:attemptId/review',  testCtrl.getAttemptReview);

module.exports = router;
