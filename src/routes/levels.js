const router = require('express').Router();
const { getPublic } = require('../controllers/levelController');

router.get('/', getPublic);

module.exports = router;
