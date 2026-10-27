const router = require('express').Router();
const c = require('../controllers/appointment.controller');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect); // everything below needs login

router.post('/', restrictTo('patient'), c.book);
router.get('/mine', c.mine);
router.get('/queue', restrictTo('doctor'), c.queue);
router.get('/patient/:userId/records', restrictTo('doctor'), c.patientRecords);
router.patch('/:id/complete', restrictTo('doctor'), c.complete);
router.patch('/:id/cancel', restrictTo('patient'), c.cancel);

module.exports = router;
