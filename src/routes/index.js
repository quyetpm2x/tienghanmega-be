const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

router.use('/auth', require('./auth'));
router.use('/courses', require('./courses'));
router.use('/teachers', require('./teachers'));
router.use('/schedule', require('./schedule'));
router.use('/registrations', require('./registrations'));
router.use('/admin', require('./admin'));

module.exports = router;
