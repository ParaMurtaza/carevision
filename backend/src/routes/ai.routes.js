const router = require('express').Router();
const c = require('../controllers/ai.controller');

const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: 'Too many requests, please wait a few minutes' } });

router.post('/triage', c.triage); // public: anyone can try the symptom checker
router.post('/recommend-doctors', c.recommend); // public
router.post('/health-report', limiter, protect, c.healthReport);

module.exports = router;
