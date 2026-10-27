// Agents read the file straight from memory (nothing is saved to disk).
const multer = require('multer');

const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB (also the API's per-image limit)
  fileFilter: (req, file, cb) =>
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only PDF, PNG, JPG or WEBP files are supported (DICOM must be exported to JPG/PNG first)'))
});
