const router = require('express').Router();
const { getPublic } = require('../controllers/courseCategoryController');

router.get('/', getPublic);

module.exports = router;
