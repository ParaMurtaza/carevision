const engine = require('../services/symptomEngine');
const recommender = require('../services/doctorRecommender');
const healthReport = require('../services/healthReport');
const AgentResult = require('../models/AgentResult');

// POST /api/ai/triage  { text, severity, duration, history }
exports.triage = (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Describe your symptoms in "text"' });
  res.json({ brief: engine.analyse(req.body) });
};

// POST /api/ai/recommend-doctors  { speciality, urgency }   (public)
exports.recommend = async (req, res, next) => {
  try {
    const { speciality = 'General Medicine', urgency = 'routine' } = req.body;
    res.json({ doctors: await recommender.recommend({ speciality: String(speciality).slice(0, 60), urgency }) });
  } catch (err) { next(err); }
};

// POST /api/ai/health-report  { source: 'symptom'|'imaging'|'skin', analysis: {...} }   (login required)
exports.healthReport = async (req, res, next) => {
  try {
    const { source, analysis } = req.body;
    if (!['symptom', 'imaging', 'skin'].includes(source)) return res.status(400).json({ message: 'Unknown report source' });
    if (!analysis || typeof analysis !== 'object' || JSON.stringify(analysis).length > 8000) {
      return res.status(400).json({ message: 'Analysis data is missing or too large' });
    }
    const { report, mode } = await healthReport.build({ source, analysis, user: req.user });
    const saved = await AgentResult.create({
      userId: req.user._id, agent: 'report', urgency: report.urgency, summary: report.headline, result: report, mode
    });
    res.status(201).json({ id: saved._id, mode, report });
  } catch (err) { next(err); }
};
