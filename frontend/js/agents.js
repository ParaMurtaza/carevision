/* ==========================================================================
   agents.js - frontend for the 3 AI agents
     1) Cara  : customer-care chat widget      -> POST /api/agents/support
     2) Imaging analyst (scan / report upload) -> POST /api/agents/imaging
     3) Skin analyst (photo upload)            -> POST /api/agents/skin
   All AI output is inserted with textContent (never innerHTML) so it cannot inject HTML.
   ========================================================================== */
(() => {
  const MAX_BYTES = 5 * 1024 * 1024;

  // tiny DOM helper
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const $ = (id) => document.getElementById(id);

  /* ---------- 1) CARA: support chat ---------- */
  const chat = [];  // [{role:'user'|'assistant', content}]

  function buildChat() {
    const bubble = el('button', 'cara-bubble', '💬 Ask Cara');
    const panel = el('div', 'cara-panel');
    panel.innerHTML = `
      <div class="cara-head"><span>Cara · Customer Care</span><button aria-label="Close">&times;</button></div>
      <div class="cara-msgs" id="caraMsgs"></div>
      <div class="cara-input"><input id="caraInput" maxlength="1000" placeholder="Type your question..." /><button id="caraSend">Send</button></div>`;
    document.body.append(bubble, panel);

    const toggle = () => panel.classList.toggle('open');
    bubble.onclick = toggle;
    panel.querySelector('.cara-head button').onclick = toggle;
    $('caraSend').onclick = sendChat;
    $('caraInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
    $('agentSupportOpen').onclick = () => { panel.classList.add('open'); $('caraInput').focus(); };

    addMsg('ai', "Hi, I'm Cara! I can help with booking a doctor, uploading reports, skin analysis and medicines. What do you need?");
  }

  function addMsg(who, text) {
    const box = $('caraMsgs');
    const m = el('div', `cara-msg ${who}`, text);
    box.appendChild(m);
    box.scrollTop = box.scrollHeight;
    return m;
  }

  async function sendChat() {
    const input = $('caraInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    chat.push({ role: 'user', content: text });

    const typing = addMsg('ai', '...');
    try {
      const { reply } = await CareVisionAPI.supportChat(chat);
      typing.textContent = reply;
      chat.push({ role: 'assistant', content: reply });
    } catch (e) {
      typing.textContent = 'Sorry, I could not answer right now: ' + e.message;
      chat.pop(); // let the user retry the same message
    }
  }

  /* ---------- shared: result renderer ---------- */
  function section(box, title, items) {
    if (!items || !items.length) return;
    box.appendChild(el('h5', null, title));
    const ul = el('ul');
    items.forEach(i => ul.appendChild(el('li', null, typeof i === 'string' ? i : `${i.name} (${i.likelihood}) - ${i.why}`)));
    box.appendChild(ul);
  }
  function paragraph(box, title, text) {
    if (!text) return;
    box.appendChild(el('h5', null, title));
    box.appendChild(el('div', null, text));
  }
  function urgencyBadge(box, urgency, specialist) {
    const row = el('div');
    const u = ['routine', 'soon', 'urgent'].includes(urgency) ? urgency : 'routine';
    row.appendChild(el('span', `ag-badge ${u}`, `Urgency: ${u}`));
    if (specialist) row.appendChild(el('span', 'ag-sub', `Suggested: ${specialist}`));
    box.appendChild(row);
  }

  // Footer under every result: which model answered, or why the basic fallback was used
  function footer(box, limitations, fallback, meta = {}) {
    box.appendChild(el('div', 'ag-sub', `Limitations: ${limitations || fallback}`));
    if (meta.mode === 'ai') box.appendChild(el('div', 'ag-sub', `🤖 Analysed by ${meta.engine || 'the local AI model'} (free, open-source, runs on this computer).`));
    else box.appendChild(el('div', 'ag-sub ag-warn', `⚠ Basic mode: ${meta.notice || 'the AI engine is not available.'} Start the AI engine for a full analysis.`));
  }

  function renderImaging(box, r, meta) {
    box.replaceChildren();
    urgencyBadge(box, r.urgency, r.recommendedSpecialist);
    paragraph(box, 'Summary', r.summary);
    paragraph(box, 'Document type', `${r.documentType || ''}${r.imageQuality ? ' · quality: ' + r.imageQuality : ''}`);
    section(box, 'Observations', r.observations);
    section(box, 'Abnormal values', r.abnormalValues);
    section(box, 'May be consistent with', r.possibleConcerns);
    paragraph(box, 'Note for doctor', r.doctorNote);
    footer(box, r.limitations, 'A doctor must confirm.', meta);
  }

  function renderSkin(box, r, meta) {
    box.replaceChildren();
    urgencyBadge(box, r.urgency, r.recommendedSpecialist);
    paragraph(box, 'Summary', r.summary);
    paragraph(box, 'Photo quality', r.photoQuality);
    section(box, 'Visible features', r.visibleFeatures);
    section(box, 'Possible conditions', r.possibleConditions);
    section(box, 'Warning signs', r.redFlags);
    section(box, 'Self-care tips', r.selfCareTips);
    section(box, 'See a doctor if', r.seeDoctorIf);
    footer(box, r.limitations, 'A dermatologist must confirm.', meta);
  }

  /* ---------- 2 + 3) file agents ---------- */
  function wireFileAgent({ source, fileId, notesId, btnId, resultId, call, render }) {
    $(btnId).onclick = async () => {
      const box = $(resultId);
      if (!CareVisionAPI.isLoggedIn()) return CareVisionAuth.open('Please log in to use this AI agent');

      const file = $(fileId).files[0];
      if (!file) { box.replaceChildren(el('span', 'ag-error', 'Choose a file first.')); return; }
      if (file.size > MAX_BYTES) { box.replaceChildren(el('span', 'ag-error', 'File is larger than 5 MB.')); return; }

      const btn = $(btnId);
      btn.disabled = true;
      box.replaceChildren(el('span', null, 'Analysing with the local AI model... this can take 20-60 seconds on a laptop.'));
      try {
        const { result, mode, engine, notice } = await call(file, $(notesId).value.trim());
        render(box, result, { mode, engine, notice });
        Recommend.afterAnalysis(box, source, result); // best doctors + full AI report
      } catch (e) {
        box.replaceChildren(el('span', 'ag-error', e.message));
      } finally { btn.disabled = false; }
    };
  }

  /* ---------- AI engine status badge ---------- */
  const HOWTO = [
    '1. Install Ollama (free) from https://ollama.com and open it.',
    '2. In a terminal run:  ollama pull llama3.2:3b   and   ollama pull gemma3:4b',
    '3. In the backend folder run:  npm run ai:check   (it must say "All good").',
    '4. Refresh this page. The badge turns green.'
  ];
  async function refreshStatus() {
    const box = $('aiStatus');
    if (!box) return;
    box.replaceChildren();
    let s;
    try { s = await CareVisionAPI.aiStatus(); } catch { s = { online: false, hint: 'Cannot reach the server.' }; }
    const ready = s.enabled && s.online && s.textReady && s.visionReady;
    const cls = ready ? 'ok' : s.online ? 'warn' : 'off';
    const text = ready ? `🟢 Free local AI online · ${s.textModel} (text) · ${s.visionModel} (images)`
      : s.online && s.enabled ? `🟠 AI engine is running but a model is missing. ${s.hint}`
      : '⚪ AI engine offline - the site works in basic mode.';
    box.className = `ai-status ${cls}`;
    box.append(el('span', null, text));
    if (!ready) {
      const b = el('button', 'ag-link', 'How to start it');
      b.onclick = () => CV.infoModal('Start the free AI engine', HOWTO, [{ text: 'Check again', primary: true, fn: refreshStatus }]);
      box.append(b);
    }
  }

  function init() {
    buildChat();
    refreshStatus();

    wireFileAgent({
      source: 'imaging', fileId: 'imagingFile', notesId: 'imagingNotes', btnId: 'imagingRun', resultId: 'imagingResult',
      call: CareVisionAPI.analyseImaging, render: renderImaging
    });
    wireFileAgent({
      source: 'skin', fileId: 'skinFile', notesId: 'skinNotes', btnId: 'skinRun', resultId: 'skinResult',
      call: CareVisionAPI.analyseSkin, render: renderSkin
    });

    // preview the chosen skin photo
    $('skinFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      const img = $('skinPreview');
      if (f && f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; }
      else img.hidden = true;
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
