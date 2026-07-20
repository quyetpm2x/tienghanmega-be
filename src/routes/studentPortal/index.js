const router = require('express').Router();
const { protectStudent } = require('../../middlewares/auth');
const ctrl = require('../../controllers/studentPortalController');
const testCtrl = require('../../controllers/studentTestController');

// All student-portal routes require a student (not admin/teacher) token.
router.use(protectStudent);

router.get('/me', ctrl.getMe);

// Bài kiểm tra: xem phiên đang mở, bắt đầu/tiếp tục làm bài, nộp bài, xem lại.
router.get('/test-sessions',                    testCtrl.getMySessions);
router.post('/test-sessions/:sessionId/start',  testCtrl.startAttempt);
router.post('/test-attempts/:attemptId/submit', testCtrl.submitAttempt);
router.put('/test-attempts/:attemptId/save',    testCtrl.saveProgress);
router.get('/test-attempts/:attemptId/review',  testCtrl.getAttemptReview);

module.exports = router;
