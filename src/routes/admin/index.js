const router = require('express').Router();
const { protect } = require('../../middlewares/auth');
const { permit } = require('../../middlewares/permit');
const { getStats } = require('../../controllers/dashboardController');

// All admin routes require auth
router.use(protect);

router.get('/dashboard', permit('dashboard.view'), getStats);
router.get('/visitors', permit('visitors.view'), require('../../controllers/ipController').getVisitors);
router.use('/students', require('./students'));
router.use('/homework', require('./homework'));
router.use('/classes', require('./classes'));
router.use('/courses', require('./courses'));
router.use('/course-categories', require('./courseCategories'));
router.use('/materials', require('./materials'));
router.use('/student-attendance', require('./studentAttendance'));
router.use('/upload',    require('./upload'));
router.use('/revenue', require('./revenue'));
router.use('/expenses', require('./expenses'));
router.use('/expense-categories', require('./expense-categories'));
router.use('/attendance', require('./attendance'));
router.use('/faqs', require('./faqs'));
router.use('/levels', require('./levels'));
router.use('/registrations', require('../registrations'));
router.use('/teachers', require('../teachers'));
router.use('/admins', require('./admins'));
router.use('/teacher-accounts', require('./teacherAccounts'));
router.use('/student-accounts', require('./studentAccounts'));
router.use('/test-questions', require('./testQuestions'));
router.use('/tests', require('./tests'));
router.use('/test-sessions', require('./testSessions'));
router.use('/teacher-bonuses', require('./teacherBonuses'));
router.use('/teacher-payments', require('./teacherPayments'));
router.use('/payroll-settings', require('./payrollSettings'));
router.use('/success-videos', require('./successVideos'));
router.use('/community-links', require('./communityLinks'));
router.use('/feedback-videos', require('./feedbackVideos'));
router.use('/feedback-images', require('./feedbackImages'));
router.use('/student-feedbacks', require('./studentFeedback'));
router.use('/affiliate', require('./affiliate'));

module.exports = router;
