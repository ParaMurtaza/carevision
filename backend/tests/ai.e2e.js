// AI pipeline tests against a MOCK open-LLM server (no model download needed).
// Run:  npm run seed (test DB) then  npm run test:ai
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.MONGO_URI = process.env.TEST_MONGO_URI || process.env.MONGO_URI || '';
if (!/test/i.test(process.env.MONGO_URI.split('?')[0])) { console.error('Refusing to run: use a database whose name contains "test".'); process.exit(1); }
process.env.LLM_BASE_URL = 'http://localhost:5400/v1';
delete process.env.LLM_API_KEY; delete process.env.LLM_ENABLED; delete process.env.LLM_TIMEOUT_MS;
process.env.LLM_TEXT_MODEL = 'llama3.2:3b'; process.env.LLM_VISION_MODEL = 'gemma3:4b';

const app = require('../src/app');
const connect = require('../src/config/db');
const mock = require('./mockLlm');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + x)); };

// smallest valid PDF with a text layer
function makePdf(lines) {
  const content = 'BT /F1 12 Tf 50 750 Td 14 TL ' + lines.map(l => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ') + ' ET';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc00000030101009ec8a8e00000000049454e44ae426082', 'hex');

(async () => {
  await connect();
  let m = await mock.start(5400);
  const srv = app.listen(5401);
  const B = 'http://localhost:5401/api';
  const call = async (method, p, { json, form, tok } = {}) => {
    const h = {}; if (tok) h.Authorization = 'Bearer ' + tok; if (json) h['Content-Type'] = 'application/json';
    const r = await fetch(B + p, { method, headers: h, body: form || (json ? JSON.stringify(json) : undefined) });
    let j = {}; try { j = await r.json(); } catch {} return { s: r.status, j };
  };
  const file = (buf, type, name) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); f.append('notes', 'cough for 2 weeks'); return f; };
  const tok = (await call('POST', '/auth/login', { json: { email: 'patient@carevision.test', password: 'Patient@123' } })).j.token;
  const last = () => m.state.calls[m.state.calls.length - 1];
  const reset = () => { m.state.calls.length = 0; m.state.mode = {}; m.state.models = ['llama3.2:3b', 'gemma3:4b']; };

  // ---- engine status
  let r = await call('GET', '/agents/status');
  ok('status: engine online, both models installed', r.j.online && r.j.textReady && r.j.visionReady && !r.j.hint, JSON.stringify(r.j));
  m.state.models = ['llama3.2:3b'];
  r = await call('GET', '/agents/status'); ok('status: missing vision model -> tells you the exact command', r.j.online && !r.j.visionReady && r.j.hint.includes('ollama pull gemma3:4b'), r.j.hint);
  reset();

  // ---- agent 1: support chat
  r = await call('POST', '/agents/support', { json: { messages: [{ role: 'user', content: 'How do I book a doctor?' }] } });
  ok('support agent answers with the TEXT model', r.j.mode === 'ai' && r.j.engine === 'llama3.2:3b' && last().model === 'llama3.2:3b' && r.j.reply.includes('book'), JSON.stringify(r.j));
  ok('support prompt (Cara) + history are sent', last().messages[0].role === 'system' && last().messages[0].content.includes('Cara') && last().messages[1].content.includes('book a doctor'));
  ok('no real API key is sent (placeholder only - Ollama needs none)', m.state.lastAuth === 'Bearer ollama', m.state.lastAuth);

  // ---- agent 2: X-ray / scan image
  reset();
  r = await call('POST', '/agents/imaging', { tok, form: file(PNG, 'image/png', 'xray.png') });
  const c = last();
  ok('imaging (PNG) uses the VISION model + JSON mode', c.model === 'gemma3:4b' && c.response_format?.type === 'json_object', c.model);
  ok('image is sent as a base64 data URI', c.messages[1].content.some(p => p.type === 'image_url' && p.image_url.url.startsWith('data:image/png;base64,')));
  ok('patient notes reach the model', c.messages[1].content.some(p => p.type === 'text' && p.text.includes('cough for 2 weeks')));
  const x = r.j.result;
  ok('messy model output is cleaned: JSON extracted from fences/prose', r.s === 200 && r.j.mode === 'ai' && r.j.engine === 'gemma3:4b' && x.documentType === 'Chest X-ray', JSON.stringify(r.j).slice(0, 200));
  ok('urgency "URGENT" normalised to "urgent"', x.urgency === 'urgent');
  ok('object / string fields coerced into clean arrays', Array.isArray(x.observations) && x.observations.length === 2 && typeof x.observations[1] === 'string' && Array.isArray(x.possibleConcerns) && x.possibleConcerns.length === 1);
  ok('unknown speciality "Pulmonology" mapped to a bookable one', x.recommendedSpecialist === 'General Medicine');
  ok('doctor-must-confirm limitation is always present', /doctor/i.test(x.limitations));
  const hist = await call('GET', '/agents/history', { tok });
  ok('result saved with the engine name', hist.j.items.some(i => i.agent === 'imaging' && i.engine === 'gemma3:4b' && i.mode === 'ai'));

  // ---- agent 2: PDF lab report (text path + trusted rule-based numbers)
  reset();
  r = await call('POST', '/agents/imaging', { tok, form: file(makePdf(['Patient: Test', 'Hemoglobin: 9.8 g/dL', 'Fasting Glucose 130 mg/dL', 'Cholesterol 180']), 'application/pdf', 'lab.pdf') });
  ok('PDF goes to the TEXT model (not vision) with extracted text', last().model === 'llama3.2:3b' && JSON.stringify(last().messages[1].content).includes('Hemoglobin') && typeof last().messages[1].content === 'string', last().model);
  ok('rule-based lab flags are passed as trusted numbers', JSON.stringify(last().messages[1].content).includes('Hemoglobin: 9.8 g/dL (LOW'));
  ok('abnormal values lead with the reliable rule-based result', r.j.result.abnormalValues[0].includes('Hemoglobin') && r.j.result.abnormalValues[0].includes('LOW') && r.j.result.abnormalValues.some(v => v.includes('Glucose')), JSON.stringify(r.j.result.abnormalValues));
  // scanned PDF (no text layer): must not call the model
  reset();
  r = await call('POST', '/agents/imaging', { tok, form: file(makePdf([]), 'application/pdf', 'scan.pdf') });
  ok('scanned PDF: clear message, model not called', r.j.mode === 'demo' && /no readable text/i.test(r.j.notice) && m.state.calls.length === 0, JSON.stringify(r.j).slice(0, 200));

  // ---- agent 3: skin
  reset();
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'rash.png') });
  const sk = r.j.result;
  ok('skin uses the VISION model', last().model === 'gemma3:4b' && r.j.mode === 'ai');
  ok('conditions + tips normalised', sk.possibleConditions.length === 2 && sk.possibleConditions[0].name === 'Eczema' && sk.possibleConditions[0].likelihood === 'possible' && Array.isArray(sk.selfCareTips));
  ok('SAFETY NET: "Melanoma" in the answer forces urgency to urgent', sk.urgency === 'urgent', sk.urgency);
  ok('skin agent rejects a PDF', (await call('POST', '/agents/skin', { tok, form: file(makePdf(['x']), 'application/pdf', 'x.pdf') })).s === 400);
  ok('agents need login', (await call('POST', '/agents/skin', { form: file(PNG, 'image/png', 'x.png') })).s === 401 && (await call('POST', '/agents/imaging', { form: file(PNG, 'image/png', 'x.png') })).s === 401);

  // ---- robustness
  reset(); m.state.mode.rejectJson = true;
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'rash.png') });
  ok('server without JSON mode: retried automatically without response_format', r.j.mode === 'ai' && m.state.calls.length === 2 && !m.state.calls[1].response_format);
  reset(); m.state.mode.garbage = true;
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'rash.png') });
  ok('garbage (non-JSON) answer: safe fallback, no crash', r.s === 200 && r.j.mode === 'demo' && /readable JSON/.test(r.j.notice), JSON.stringify(r.j).slice(0, 160));
  reset(); m.state.mode.missingModel = true;
  r = await call('POST', '/agents/imaging', { tok, form: file(PNG, 'image/png', 'x.png') });
  ok('model not installed: fallback + exact "ollama pull" command', r.j.mode === 'demo' && r.j.notice.includes('ollama pull gemma3:4b'), r.j.notice);
  r = await call('POST', '/agents/support', { json: { messages: [{ role: 'user', content: 'how to book' }] } });
  ok('support chat falls back to the FAQ when the model is missing', r.j.mode === 'demo' && r.j.notice.includes('ollama pull llama3.2:3b') && r.j.reply.length > 20);
  reset(); m.state.mode.delay = 1500; process.env.LLM_TIMEOUT_MS = '400';
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'rash.png') });
  ok('slow model: times out cleanly with a helpful message', r.j.mode === 'demo' && /too long/i.test(r.j.notice), r.j.notice);
  delete process.env.LLM_TIMEOUT_MS; reset();

  // ---- AI health report
  r = await call('POST', '/ai/health-report', { tok, json: { source: 'symptom', analysis: { symptoms: ['chest pain'], severity: 8, triageLevel: 'High', suggestedSpeciality: 'Cardiology', notes: 'Chest pain for 2 days.' } } });
  ok('health report written by the local model + doctors attached', r.s === 201 && r.j.mode === 'ai' && r.j.report.headline.includes('angina') && r.j.report.recommendedDoctors[0].doctor.specialty === 'Cardiology' && r.j.report.followUp, JSON.stringify(r.j).slice(0, 200));

  // ---- engine switched off / offline
  reset();
  process.env.LLM_ENABLED = 'false';
  r = await call('GET', '/agents/status'); ok('LLM_ENABLED=false is reported', r.j.enabled === false && /switched off/.test(r.j.hint));
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'x.png') });
  ok('LLM_ENABLED=false: basic mode, no model call', r.j.mode === 'demo' && /switched off/.test(r.j.notice) && m.state.calls.length === 0);
  delete process.env.LLM_ENABLED;

  await m.stop();     // === the AI engine is now OFFLINE ===
  r = await call('GET', '/agents/status'); ok('OFFLINE: status says engine is not running', r.j.online === false && /not running/i.test(r.j.hint), JSON.stringify(r.j));
  r = await call('POST', '/agents/support', { json: { messages: [{ role: 'user', content: 'how do I upload my MRI?' }] } });
  ok('OFFLINE: Cara still answers from the FAQ', r.j.mode === 'demo' && r.j.reply.includes('AI Agents'));
  r = await call('POST', '/agents/imaging', { tok, form: file(makePdf(['Hemoglobin: 9.8 g/dL']), 'application/pdf', 'lab.pdf') });
  ok('OFFLINE: PDF lab report still read by the rule-based reader', r.s === 200 && r.j.mode === 'demo' && r.j.result.abnormalValues[0].includes('Hemoglobin') && /Start Ollama/.test(r.j.notice), JSON.stringify(r.j).slice(0, 200));
  r = await call('POST', '/agents/skin', { tok, form: file(PNG, 'image/png', 'x.png') });
  ok('OFFLINE: skin agent degrades gracefully (still suggests a dermatologist)', r.s === 200 && r.j.mode === 'demo' && r.j.result.recommendedSpecialist === 'Dermatology');
  r = await call('POST', '/ai/health-report', { tok, json: { source: 'skin', analysis: { urgency: 'soon', summary: 'A rash.', visibleFeatures: ['red patch'] } } });
  ok('OFFLINE: AI Health Report still generated from built-in templates', r.s === 201 && r.j.mode === 'demo' && r.j.report.dos.length >= 4 && r.j.report.speciality === 'Dermatology');

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
