const path = require('path');
const fs = require('fs');
const multer = require('multer');

const dir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: dir,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) =>
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF, PNG, JPG or TXT files are allowed'))
});
