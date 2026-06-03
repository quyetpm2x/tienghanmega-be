const router = require('express').Router();
const ctrl = require('../controllers/materialController');

router.get('/', ctrl.getAll);

module.exports = router;
