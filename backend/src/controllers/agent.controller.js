const AgentResult = require('../models/AgentResult');
const supportAgent = require('../services/agents/supportAgent');
const imagingAgent = require('../services/agents/imagingAgent');
const skinAgent = require('../services/agents/skinAgent');
const llm = require('../services/agents/llmClient');

// POST /api/agents/support   { messages: [{role:'user'|'assistant', content}] }
exports.support = async (req, res, next) => {
  try {
    const raw = Array.isArray(req.body.messages) ? req.body.messages : [];
    // keep only the last 10 valid messages and clamp length (cost + abuse control)
    const history = raw
      .filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
    // the API requires the conversation to start with a user message and end with one
    while (history.length && history[0].role !== 'user') history.shift();
    if (!history.length || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ message: 'Send at least one user message' });
    }
    res.json(await supportAgent.reply(history));
  } catch (err) { next(err); }
};

// shared logic for imaging + skin
const fileAgent = (agentName, agent) => async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please attach a file in the "file" field' });
    const { result, mode, engine, notice } = await agent.analyse(req.file, req.body.notes || '');
    const saved = await AgentResult.create({
      userId: req.user._id, agent: agentName, fileName: req.file.originalname,
      urgency: result.urgency, summary: result.summary, result, mode, engine
    });
    res.json({ id: saved._id, mode, engine, notice, result });
  } catch (err) { next(err); }
};

exports.imaging = fileAgent('imaging', imagingAgent);
exports.skin = fileAgent('skin', skinAgent);

exports.history = async (req, res, next) => {
  try {
    const items = await AgentResult.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ items });
  } catch (err) { next(err); }
};

// GET /api/agents/status  (public) - is the free local AI engine running, and are the models installed?
exports.status = async (req, res, next) => {
  try { res.json(await llm.status()); } catch (err) { next(err); }
};
