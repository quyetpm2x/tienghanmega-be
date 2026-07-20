const router = require('express').Router();
const ctrl = require('../../controllers/adminTestSessionController');

router.get('/',                     ctrl.getAllSessions);
router.post('/',                    ctrl.createSession);
router.put('/:id',                  ctrl.updateSession);
router.delete('/:id',               ctrl.deleteSession);
router.get('/:id/results',          ctrl.getSessionResults);
router.put('/:id/disqualify',       ctrl.setDisqualified);
router.get('/attempts/:attemptId',  ctrl.getAttemptDetail);

module.exports = router;
