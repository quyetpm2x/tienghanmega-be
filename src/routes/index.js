const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

router.use('/ip', require('./ip'));
router.use('/auth', require('./auth'));
router.use('/courses', require('./courses'));
router.use('/course-categories', require('./courseCategories'));
router.use('/classes', require('./classes'));
router.use('/teachers', require('./teachers'));
router.use('/schedule', require('./schedule'));
router.use('/registrations', require('./registrations'));
router.use('/faqs', require('./faqs'));
router.use('/levels', require('./levels'));
router.use('/materials', require('./materials'));
router.use('/stories', require('./stories'));
router.use('/success-videos', require('./successVideos'));
router.use('/community-links', require('./communityLinks'));
router.use('/feedback-videos', require('./feedbackVideos'));
router.use('/vocab', require('./vocab'));
router.use('/topik-questions', require('./topik-questions'));
router.use('/teacher-portal', require('./teacherPortal'));
router.use('/admin', require('./admin'));

module.exports = router;
