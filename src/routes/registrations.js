const router = require('express').Router();
const ctrl = require('../controllers/registrationController');
const { protect } = require('../middlewares/auth');
const { permit } = require('../middlewares/permit');

// Public: submit registration
router.post('/', ctrl.submit);

// Admin only
router.get('/', protect, permit('registrations.view'), ctrl.getAll);
router.put('/:id/status', protect, permit('registrations.updateStatus'), ctrl.updateStatus);
router.put('/:id/convert', protect, permit('registrations.convert'), ctrl.markConverted);
router.delete('/:id', protect, permit('registrations.delete'), ctrl.remove);

module.exports = router;
