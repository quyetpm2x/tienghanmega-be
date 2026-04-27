const router = require('express').Router();
const { protect } = require('../../middlewares/auth');
const { getStats } = require('../../controllers/dashboardController');

// All admin routes require auth
router.use(protect);

router.get('/dashboard', getStats);
router.use('/students', require('./students'));
router.use('/classes', require('./classes'));
router.use('/revenue', require('./revenue'));
router.use('/attendance', require('./attendance'));
router.use('/registrations', require('../registrations'));
router.use('/teachers', require('../teachers'));

module.exports = router;
