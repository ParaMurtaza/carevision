const router = require('express').Router();
const c = require('../controllers/service.controller');
const { protect } = require('../middleware/auth');

router.get('/catalog', c.catalog);
router.post('/requests', protect, c.create);
router.get('/requests/mine', protect, c.mine);
router.patch('/requests/:id/cancel', protect, c.cancel);

module.exports = router;
