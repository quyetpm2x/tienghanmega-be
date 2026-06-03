const router = require('express').Router();
const { getIpInfo, trackVisit, geocode } = require('../controllers/ipController');

router.get('/',          getIpInfo);
router.post('/visit',    trackVisit);
router.post('/geocode',  geocode);

module.exports = router;
