const mongoose = require('mongoose');

// Stores what the imaging / skin agents produced, so patient and doctor can see history.
const agentResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agent: { type: String, enum: ['imaging', 'skin', 'report'], required: true },
  fileName: String,
  urgency: String,
  summary: String,
  result: mongoose.Schema.Types.Mixed, // full structured JSON from the agent
  mode: { type: String, default: 'ai' }, // 'ai' (real model answered) or 'demo' (fallback)
  engine: String                          // which model produced it, e.g. gemma3:4b
}, { timestamps: true });

module.exports = mongoose.model('AgentResult', agentResultSchema);
