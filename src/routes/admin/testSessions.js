const router = require('express').Router();
const ctrl = require('../../controllers/adminTestSessionController');
const { permit } = require('../../middlewares/permit');

router.get('/',                     permit('tests.resultView'), ctrl.getAllSessions);
router.post('/',                    permit('tests.resultCreate'), ctrl.createSession);
router.put('/:id',                  permit('tests.resultUpdate'), ctrl.updateSession);
router.delete('/:id',               permit('tests.resultDelete'), ctrl.deleteSession);
router.get('/:id/results',          permit('tests.resultView'), ctrl.getSessionResults);
router.put('/:id/disqualify',       permit('tests.resultUpdate'), ctrl.setDisqualified);
router.get('/attempts/:attemptId',  permit('tests.resultView'), ctrl.getAttemptDetail);
router.put('/attempts/:attemptId/grade', permit('tests.resultUpdate'), ctrl.gradeAttempt);

module.exports = router;
