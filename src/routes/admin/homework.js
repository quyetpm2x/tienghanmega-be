const router = require('express').Router();
const ctrl = require('../../controllers/adminHomeworkController');
const { permit } = require('../../middlewares/permit');

// Read-only — mount đã đi qua protect(admin) ở routes/admin/index.js.
router.get('/assignments', permit('homework.view'), ctrl.getAssignments);
router.get('/assignments/:id', permit('homework.view'), ctrl.getAssignment);
router.get('/assignments/:id/submissions', permit('homework.viewSubmissions'), ctrl.getAssignmentSubmissions);

module.exports = router;
