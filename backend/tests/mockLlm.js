// A tiny fake OpenAI-compatible LLM server (what Ollama looks like from the outside).
// Used by tests so the AI pipeline can be checked without downloading a multi-GB model.
const http = require('http');

function start(port) {
  const state = { calls: [], mode: {}, models: ['llama3.2:3b', 'gemma3:4b'] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', async () => {
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/v1/models') return send(200, { data: state.models.map(id => ({ id })) });
      if (req.url !== '/v1/chat/completions') return send(404, {});
      const body = JSON.parse(raw);
      state.calls.push(body);
      state.lastAuth = req.headers.authorization;
      const m = state.mode;
      if (m.delay) await new Promise(r => setTimeout(r, m.delay));
      if (m.missingModel) return send(404, { error: { message: `model "${body.model}" not found, try pulling it first` } });
      if (m.rejectJson && body.response_format) return send(400, { error: { message: 'response_format not supported' } });
      const sys = body.messages[0].content;
      let content;
      if (m.garbage) content = 'Sorry, I cannot help with that.';
      else if (sys.includes('You are "Cara"')) content = 'You can book a doctor from the symptom checker. Need anything else?';
      else if (sys.includes('Medical Imaging & Report Analysis agent')) {
        // deliberately messy, like a small model: fences, prose, wrong types, wrong case
        content = '```json\n' + JSON.stringify({
          documentType: 'Chest X-ray', imageQuality: 'good', observations: ['Clear lung fields', { note: 'Mild blunting of the right costophrenic angle' }],
          abnormalValues: ['Hemoglobin looks low'], possibleConcerns: 'Small pleural effusion may be consistent', urgency: 'URGENT',
          recommendedSpecialist: 'Pulmonology', summary: 'The image may show a small fluid collection.', doctorNote: 'Correlate clinically.', limitations: 'Single view only.'
        }) + '\n```\nHope this helps!';
      } else if (sys.includes('Skin Analysis agent')) {
        content = JSON.stringify({ photoQuality: 'good', visibleFeatures: ['red scaly patch'], possibleConditions: ['Eczema', { name: 'Melanoma', likelihood: 'less likely', why: 'irregular edge' }],
          urgency: 'routine', redFlags: [], selfCareTips: 'Moisturise daily', seeDoctorIf: ['It grows'], summary: 'A red scaly patch is visible.', limitations: '' });
      } else if (sys.includes('AI Health Report')) {
        content = JSON.stringify({ headline: 'Findings that may point to angina', whatItMeans: 'Chest discomfort needs an ECG.', recoveryOutlook: 'Many people improve once the cause is found.',
          dos: ['Rest', 'Carry your medicine list', 'Note triggers', 'Check blood pressure'], donts: ['Do not exercise hard'], lifestyle: ['Low-salt diet'], warningSigns: ['Pain spreading to the arm'], followUp: 'See a doctor today.' });
      } else content = '{}';
      send(200, { choices: [{ message: { role: 'assistant', content } }] });
    });
  });
  return new Promise(resolve => server.listen(port, () => resolve({ state, stop: () => new Promise(r => server.close(r)) })));
}
module.exports = { start };
