const router = require('express').Router();
const c = require('../controllers/doctor.controller');
const { protect, restrictTo } = require('../middleware/auth');

router.get('/', c.list);
router.get('/me', protect, restrictTo('doctor'), c.me); // must be before '/:id'
router.get('/:id', c.getOne);

module.exports = router;
