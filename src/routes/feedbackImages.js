const router = require('express').Router();
const { getPublic } = require('../controllers/feedbackImageController');

router.get('/', getPublic);

module.exports = router;
