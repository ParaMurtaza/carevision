const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/agent.controller');
const upload = require('../middleware/uploadMemory');
const { protect } = require('../middleware/auth');

router.get('/status', c.status);   // cheap health check, not rate-limited

// AI calls use CPU/GPU: 30 requests / 15 min per IP
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { message: 'Too many AI requests, please wait a few minutes' } }));

router.post('/support', c.support);                                   // public chat
router.post('/imaging', protect, upload.single('file'), c.imaging);  // login required
router.post('/skin', protect, upload.single('file'), c.skin);        // login required
router.get('/history', protect, c.history);

module.exports = router;
