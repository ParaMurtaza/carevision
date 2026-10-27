const fs = require('fs');
const path = require('path');
const Report = require('../models/Report');
const analyzer = require('../services/reportAnalyzer');

// POST /api/reports  (multipart: field "report", optional "type")
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please attach a file in the "report" field' });

    const { summary, findings } = await analyzer.analyse(req.file.path, req.file.mimetype);
    const report = await Report.create({
      userId: req.user._id,
      fileUrl: `/api/reports/file/${req.file.filename}`,
      originalName: req.file.originalname,
      type: req.body.type || 'General',
      aiSummary: summary,
      findings
    });
    res.status(201).json({ report });
  } catch (err) { next(err); }
};

exports.mine = async (req, res, next) => {
  try {
    res.json({ reports: await Report.find({ userId: req.user._id }).sort({ uploadedAt: -1 }) });
  } catch (err) { next(err); }
};

// Files are private: only the owner can download (uploads/ is NOT served statically)
exports.download = async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const owns = await Report.findOne({ userId: req.user._id, fileUrl: `/api/reports/file/${filename}` });
    if (!owns) return res.status(403).json({ message: 'Not allowed' });
    const full = path.join(__dirname, '..', '..', 'uploads', filename);
    if (!fs.existsSync(full)) return res.status(404).json({ message: 'File missing' });
    res.sendFile(full);
  } catch (err) { next(err); }
};
