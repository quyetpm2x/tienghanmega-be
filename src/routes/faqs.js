const router = require('express').Router();
const { getPublic } = require('../controllers/faqController');

router.get('/', getPublic);

module.exports = router;
