const router = require('express').Router();
const ctrl = require('../../controllers/adminHomeworkController');

// Read-only — mount đã đi qua protect(admin) ở routes/admin/index.js.
router.get('/assignments', ctrl.getAssignments);
router.get('/assignments/:id', ctrl.getAssignment);
router.get('/assignments/:id/submissions', ctrl.getAssignmentSubmissions);

module.exports = router;
