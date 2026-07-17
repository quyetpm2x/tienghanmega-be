const router = require('express').Router();
const { protectStudent } = require('../../middlewares/auth');
const ctrl = require('../../controllers/studentPortalController');

// All student-portal routes require a student (not admin/teacher) token.
router.use(protectStudent);

router.get('/me', ctrl.getMe);

module.exports = router;
