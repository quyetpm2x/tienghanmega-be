const router = require('express').Router();
const ctrl = require('../controllers/scheduleController');

router.get('/', ctrl.getAll);

module.exports = router;
