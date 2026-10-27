// AGENT 1 - customer support chatbot ("Cara"), powered by the local open LLM (free, no key)
const llm = require('./llmClient');
const { SUPPORT } = require('./prompts');

// Used whenever the AI engine is offline - a simple keyword FAQ so the chat never dies
const FAQ = [
  [/book|appointment|doctor|consult/, 'To book: use the AI symptom checker, click "Schedule Consult with Brief", pick a doctor, date and time, then confirm. You need to be logged in.'],
  [/report|upload|scan|mri|ct|x-?ray/, 'Use the "AI Agents" section to upload a PDF/JPG/PNG (max 5 MB) and the Scan & Report Analyst will summarise it for you.'],
  [/skin|rash|acne/, 'Try the Skin Analysis agent in the "AI Agents" section, or book a dermatologist from the booking window.'],
  [/medicine|pharmacy|order/, 'Open "Order Medicines" in Services to compare sample prices and place an order request.'],
  [/login|password|account|register/, 'Use the Log in button in the top bar. New patients can create an account from the same window.']
];

exports.reply = async (history) => {
  let notice = '';
  if (llm.isEnabled()) {
    try {
      const reply = await llm.callLLM({ system: SUPPORT, messages: history, maxTokens: 300, temperature: 0.4, timeoutMs: 60000 });
      return { reply, mode: 'ai', engine: llm.modelFor(false) };
    } catch (e) { notice = e.message; }
  }
  const last = (history[history.length - 1]?.content || '').toLowerCase();
  const hit = FAQ.find(([re]) => re.test(last));
  return { reply: hit ? hit[1] : 'I can help with booking, reports, skin analysis and medicines. (The AI engine is offline, so I am answering from a short FAQ.)', mode: 'demo', notice };
};
