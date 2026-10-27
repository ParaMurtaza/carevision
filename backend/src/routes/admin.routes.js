const router = require('express').Router();
const c = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect, restrictTo('admin')); // admin only

router.get('/stats', c.stats);
router.get('/users', c.users);
router.patch('/users/:id/toggle', c.toggleUser);
router.post('/doctors', c.addDoctor);
router.patch('/doctors/:id', c.updateDoctor);
router.delete('/doctors/:id', c.deleteDoctor);
router.get('/appointments', c.appointments);
router.get('/requests', c.requests);
router.patch('/requests/:id', c.updateRequest);

module.exports = router;
