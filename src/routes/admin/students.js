const router = require('express').Router();
const ctrl = require('../../controllers/studentController');
const { permit } = require('../../middlewares/permit');

router.get('/', permit('students.view'), ctrl.getAll);
router.get('/stats', permit('students.view'), ctrl.getStats);
router.get('/:id', permit('students.viewDetail'), ctrl.getOne);
router.post('/', permit('students.create'), ctrl.create);
router.put('/:id', permit('students.update'), ctrl.update);
router.delete('/:id', permit('students.delete'), ctrl.remove);
router.post('/:id/referral-code', permit('students.generateReferral'), ctrl.generateReferralCode);

// Gói đăng ký và từng khoá trong gói.
router.post('/:id/packages', permit('students.update'), ctrl.addPackage);
router.put('/:id/packages/:packageId', permit('students.update'), ctrl.updatePackage);
router.put('/:id/packages/:packageId/adjustment', permit('students.update'), ctrl.setPackagePaid);
// Xoá gói kéo theo khoá + khoản thu + hoa hồng → dùng quyền xoá, không phải quyền sửa.
router.delete('/:id/packages/:packageId', permit('students.delete'), ctrl.deletePackage);
router.put('/:id/enrollments/:enrollmentId', permit('students.update'), ctrl.updateEnrollment);
router.post('/:id/enrollments/:enrollmentId/transfer', permit('students.transfer'), ctrl.transferEnrollment);

router.get('/:id/payments', permit('students.viewPayments'), ctrl.getPayments);
router.get('/:id/payment-history', permit('students.viewPayments'), ctrl.getPaymentHistory);
router.post('/:id/payments', permit('students.addPayment'), ctrl.addPayment);
router.put('/:id/payments/:paymentId', permit('students.editPayment'), ctrl.updatePayment);
router.delete('/:id/payments/:paymentId', permit('students.deletePayment'), ctrl.deletePayment);
// Tiền cũ chưa có ngày đóng → tạo khoản thu thật, trừ lại paidAdjustment (tổng giữ nguyên).
router.post('/:id/packages/:packageId/legacy-payment', permit('students.editPayment'), ctrl.convertLegacyPaid);

module.exports = router;
