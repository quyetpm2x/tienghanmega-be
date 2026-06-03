const router = require('express').Router();
const { protect } = require('../../middlewares/auth');
const { getStats } = require('../../controllers/dashboardController');

// All admin routes require auth
router.use(protect);

router.get('/dashboard', getStats);
router.get('/visitors', require('../../controllers/ipController').getVisitors);
router.use('/students', require('./students'));
router.use('/classes', require('./classes'));
router.use('/courses', require('./courses'));
router.use('/materials', require('./materials'));
router.use('/student-attendance', require('./studentAttendance'));
router.use('/upload',    require('./upload'));
router.use('/revenue', require('./revenue'));
router.use('/expenses', require('./expenses'));
router.use('/attendance', require('./attendance'));
router.use('/faqs', require('./faqs'));
router.use('/levels', require('./levels'));
router.use('/registrations', require('../registrations'));
router.use('/teachers', require('../teachers'));

module.exports = router;
