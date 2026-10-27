const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fileUrl: { type: String, required: true },
  originalName: String,
  type: { type: String, default: 'General' }, // Blood test, X-ray, ...
  aiSummary: String,
  findings: [String],
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
