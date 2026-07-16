const router = require('express').Router();
const { getPublic } = require('../controllers/feedbackVideoController');

router.get('/', getPublic);

module.exports = router;
