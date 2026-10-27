const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// Slow down password guessing: 20 tries / 15 min per IP
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { message: 'Too many attempts, try later' } });

router.post('/register', limiter, c.register);
router.post('/login', limiter, c.login);
router.get('/me', protect, c.me);
router.patch('/me', protect, c.updateMe);

module.exports = router;
