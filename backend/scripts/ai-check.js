// npm run ai:check  - tells you if the free local AI engine is ready, and tries one real answer.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const llm = require('../src/services/agents/llmClient');

(async () => {
  const s = await llm.status();
  const line = (ok, text) => console.log(`${ok ? '  OK ' : ' FAIL'}  ${text}`);
  console.log(`\nCareVision AI engine check  (${s.baseUrl})\n`);
  line(s.enabled, 'AI enabled (LLM_ENABLED)');
  line(s.online, 'AI engine reachable');
  line(s.textReady, `text model installed:   ${s.textModel}`);
  line(s.visionReady, `vision model installed: ${s.visionModel}`);
  if (s.installed.length) console.log(`\n  Installed models: ${s.installed.join(', ')}`);
  if (s.hint) console.log(`\n  -> ${s.hint}`);

  if (s.online && s.textReady) {
    process.stdout.write('\n  Asking the text model a test question (first answer can take a while) ... ');
    const t = Date.now();
    try {
      const out = await llm.callLLM({ system: 'Reply with one valid JSON object only.', json: true, maxTokens: 60,
        messages: [{ role: 'user', content: 'Return {"status":"ready","model":"<your name>"}' }] });
      console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s\n  Answer: ${out.slice(0, 120)}`);
    } catch (e) { console.log('failed\n  ' + e.message); process.exitCode = 1; }
  }
  const ready = s.enabled && s.online && s.textReady && s.visionReady;
  console.log(ready ? '\n  All good - start the website with:  npm run dev\n' : '\n  Not ready yet - follow the hint above, then run this check again.\n');
  process.exit(ready ? 0 : 1);
})();
