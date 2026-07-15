const router = require('express').Router();
const { getPublic } = require('../controllers/successVideoController');

router.get('/', getPublic);

module.exports = router;
