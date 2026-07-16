const router = require('express').Router();
const { getPublic } = require('../controllers/communityLinkController');

router.get('/', getPublic);

module.exports = router;
