const router = require('express').Router();
const c = require('../controllers/report.controller');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/', upload.single('report'), c.upload);
router.get('/', c.mine);
router.get('/file/:filename', c.download);

module.exports = router;
