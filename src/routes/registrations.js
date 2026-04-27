const router = require('express').Router();
const ctrl = require('../controllers/registrationController');
const { protect } = require('../middlewares/auth');

// Public: submit registration
router.post('/', ctrl.submit);

// Admin only
router.get('/', protect, ctrl.getAll);
router.put('/:id/status', protect, ctrl.updateStatus);
router.delete('/:id', protect, ctrl.remove);

module.exports = router;
