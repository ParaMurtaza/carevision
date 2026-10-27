// ONE small client for any OpenAI-compatible LLM server.
// Default = Ollama running on YOUR computer: free, open-source models (Llama, Gemma ...), NO API key, data stays local.
// Also works with LM Studio, vLLM, Groq, OpenRouter ... by changing LLM_BASE_URL (and LLM_API_KEY if that service needs one).

const cfg = () => ({
  base: (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),
  key: process.env.LLM_API_KEY || 'ollama',                         // Ollama ignores the key
  textModel: process.env.LLM_TEXT_MODEL || 'llama3.2:3b',           // Meta Llama 3.2 (3B): chat, reports, PDFs
  visionModel: process.env.LLM_VISION_MODEL || 'gemma3:4b',         // can look at images (X-ray / skin photo)
  timeout: Number(process.env.LLM_TIMEOUT_MS) || 180000,            // laptops can be slow
  enabled: process.env.LLM_ENABLED !== 'false'
});

class LlmError extends Error {
  constructor(message, code, status = 502) { super(message); this.code = code; this.status = status; }
}

const isEnabled = () => cfg().enabled;
const modelFor = (vision) => (vision ? cfg().visionModel : cfg().textModel);

async function post(c, body, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout || c.timeout);
  try {
    return await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new LlmError('The AI engine took too long to answer. Try a smaller image or a smaller model.', 'timeout', 504);
    throw new LlmError(`Cannot reach the AI engine at ${c.base}. Start Ollama (see GUIDE.md, section "AI part").`, 'offline', 503);
  } finally { clearTimeout(timer); }
}

// messages: [{ role:'user'|'assistant', content: string | [{type:'text'|'image_url', ...}] }]
async function callLLM({ system, messages, vision = false, json = false, maxTokens = 1000, temperature = 0.2, timeoutMs }) {
  const c = cfg();
  if (!c.enabled) throw new LlmError('The AI engine is switched off (LLM_ENABLED=false).', 'disabled', 503);
  const model = vision ? c.visionModel : c.textModel;
  const body = { model, messages: [{ role: 'system', content: system }, ...messages], max_tokens: maxTokens, temperature, stream: false };
  if (json) body.response_format = { type: 'json_object' };

  let res = await post(c, body, timeoutMs);
  if (res.status === 400 && json) { delete body.response_format; res = await post(c, body, timeoutMs); } // some servers have no JSON mode
  if (res.status === 404) throw new LlmError(`The model "${model}" is not installed. Run:  ollama pull ${model}`, 'model_missing', 503);
  if (!res.ok) {
    console.error('LLM error', res.status, (await res.text()).slice(0, 300));
    throw new LlmError(`The AI engine returned an error (${res.status}).`, 'http');
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw new LlmError('The AI engine returned an empty answer.', 'bad_output');
  return String(text).trim();
}

// Small models often wrap JSON in ```fences``` or add a sentence - pull the object out safely.
function parseJson(text) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new LlmError('The AI answer was not readable JSON. Please retry.', 'bad_output');
  try { return JSON.parse(text.slice(start, end + 1)); }
  catch { throw new LlmError('The AI answer was not readable JSON. Please retry.', 'bad_output'); }
}

// uploaded image -> OpenAI-style image part (a base64 data URI)
const imagePart = (file) => ({ type: 'image_url', image_url: { url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` } });

// Is the engine up, and are the configured models installed? (used by the UI badge and `npm run ai:check`)
async function status() {
  const c = cfg();
  const out = { enabled: c.enabled, baseUrl: c.base, textModel: c.textModel, visionModel: c.visionModel,
    online: false, textReady: false, visionReady: false, installed: [], hint: '' };
  if (!c.enabled) { out.hint = 'AI engine is switched off (LLM_ENABLED=false). Basic rule-based mode is active.'; return out; }
  try {
    const r = await fetch(`${c.base}/models`, { headers: { authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const j = await r.json();
      out.installed = (j.data || []).map(m => m.id);
      out.online = true;
      const has = (n) => out.installed.includes(n) || (!n.includes(':') && out.installed.includes(`${n}:latest`));
      out.textReady = has(c.textModel);
      out.visionReady = has(c.visionModel);
    }
  } catch { /* offline */ }
  if (!out.online) out.hint = 'AI engine not running. Install Ollama and start it (see GUIDE.md, section "AI part").';
  else if (!out.textReady || !out.visionReady) {
    out.hint = 'Missing model(s). Run: ' + [!out.textReady && `ollama pull ${c.textModel}`, !out.visionReady && `ollama pull ${c.visionModel}`].filter(Boolean).join('  and  ');
  }
  return out;
}

module.exports = { callLLM, parseJson, imagePart, status, isEnabled, modelFor, LlmError };
