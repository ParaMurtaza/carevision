/* ==========================================================================
   ui.js - small shared toolkit used by every other frontend file:
   toasts, DOM builder, form modal, info modal, print helper, footer links.
   Everything is built with textContent (never innerHTML) so user/AI text is safe.
   ========================================================================== */
const CV = (() => {
  const stack = []; // open dynamic overlays (Esc closes the top one)

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }

  function toast(msg, type = 'info') {
    let box = document.getElementById('cvToasts');
    if (!box) { box = el('div', { id: 'cvToasts', class: 'cv-toasts' }); document.body.append(box); }
    const t = el('div', { class: `cv-toast ${type}`, text: msg });
    box.append(t);
    setTimeout(() => t.remove(), 4500);
  }

  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const when = (d) => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const day = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const badge = (text, cls = '') => el('span', { class: `cv-badge ${cls}`, text });
  const levelClass = (u) => ({ urgent: 'bad', soon: 'warn', routine: 'good', High: 'bad', Moderate: 'warn', Low: 'good',
    booked: 'info', completed: 'good', cancelled: 'bad', requested: 'warn', confirmed: 'info' }[u] || '');

  // Generic overlay with a close button. Returns { box, close }.
  function overlay({ wide = false, paper = false } = {}) {
    const ov = el('div', { class: 'cv-overlay open cv-dyn' });
    const box = el('div', { class: `cv-box${wide ? ' wide' : ''}${paper ? ' paper' : ''}` });
    const close = () => { ov.remove(); const i = stack.indexOf(close); if (i > -1) stack.splice(i, 1); };
    box.append(el('button', { class: 'cv-close no-print', 'aria-label': 'Close', text: '×', onclick: close }));
    ov.append(box);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.body.append(ov);
    stack.push(close);
    return { box, close };
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1](); });
  const closeAll = () => { while (stack.length) stack[stack.length - 1](); };

  /* Form modal: fields = [{ name, label, type, required, placeholder, options, min, value }] */
  function formModal({ title, intro, fields, submitText = 'Submit', onSubmit }) {
    const { box, close } = overlay();
    box.append(el('h3', { text: title }));
    if (intro) box.append(el('p', { class: 'cv-note', text: intro }));
    const inputs = {};
    fields.forEach(f => {
      let input;
      if (f.type === 'textarea') input = el('textarea', { rows: 3, placeholder: f.placeholder || '' });
      else if (f.type === 'select') input = el('select', null, f.options.map(o => el('option', { value: o, text: o })));
      else input = el('input', { type: f.type || 'text', placeholder: f.placeholder || '', min: f.min, max: f.max, maxlength: f.maxlength });
      if (f.value != null) input.value = f.value;
      inputs[f.name] = input;
      box.append(el('label', { class: 'cv-label' }, f.label + (f.required ? ' *' : ''), input));
    });
    const err = el('p', { class: 'cv-error' });
    const btn = el('button', { class: 'btn-primary cv-submit', text: submitText });
    btn.onclick = async () => {
      err.textContent = '';
      const values = {};
      for (const f of fields) {
        values[f.name] = inputs[f.name].value.trim();
        if (f.required && !values[f.name]) { err.textContent = `${f.label} is required`; inputs[f.name].focus(); return; }
      }
      btn.disabled = true; btn.textContent = 'Please wait...';
      try {
        const keepOpen = await onSubmit(values);
        if (keepOpen !== false) close();
      } catch (e) { err.textContent = e.message; }
      finally { btn.disabled = false; btn.textContent = submitText; }
    };
    box.append(err, btn);
    const first = Object.values(inputs)[0]; if (first) setTimeout(() => first.focus(), 50);
    return { close };
  }

  /* Info modal: paragraphs = [string], actions = [{ text, primary, fn }] */
  function infoModal(title, paragraphs, actions = []) {
    const { box, close } = overlay();
    box.append(el('h3', { text: title }));
    paragraphs.forEach(p => box.append(el('p', { class: 'cv-note', text: p })));
    if (actions.length) box.append(el('div', { class: 'cv-actions' }, actions.map(a =>
      el('button', { class: a.primary ? 'btn-primary' : 'btn-outline', text: a.text, onclick: () => { close(); a.fn && a.fn(); } }))));
    return { close };
  }

  // Printable page in a new window (used for prescriptions). sections = [{ h, lines: [] }]
  function printDoc(title, sections) {
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print', 'warn');
    w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;max-width:720px;margin:30px auto;color:#111}
      h1{color:#16a34a;margin-bottom:0}h2{font-size:15px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:22px}small{color:#666}li{margin:4px 0}</style>
      <h1>CareVision AI</h1><small>${esc(title)}</small>${sections.map(s => `<h2>${esc(s.h)}</h2><ul>${s.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
      <p><small>AI-assisted platform. This document does not replace in-person medical advice.</small></p>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  // ---- navigation helpers ----
  const openBooking = (speciality = 'General Medicine') => { state.selectedSpeciality = speciality; openModal('bookingModal'); };
  function goAgent(cardId) {
    const target = document.getElementById(cardId) || document.getElementById('agents');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('pulse'); setTimeout(() => target.classList.remove('pulse'), 2200);
  }
  const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // ---- wire every footer / CTA / portal link that used to be a dead "#" ----
  function wireLinks() {
    const soon = (what) => () => toast(`${what} is coming soon.`, 'info');
    const about = () => infoModal('About CareVision AI', [
      'CareVision AI is an AI-assisted telemedicine platform: an AI symptom checker prepares a case brief, three AI agents help with customer care, scan/report reading and skin analysis, and patients are matched with the best-suited doctor.',
      'Built as a college project by Murtaza. It supports patients, doctors and the clinic admin, each with their own limited-access portal.']);
    const contact = () => infoModal('Contact us', ['Email: support@carevision.example (demo address)', 'Chat with Cara, our AI customer-care agent, using the blue "Ask Cara" button for instant help.'],
      [{ text: 'Open Cara', primary: true, fn: () => document.querySelector('.cara-bubble')?.click() }]);
    const privacy = () => infoModal('Privacy Policy', ['We store only what is needed to run your account, appointments and reports.',
      'Reports and images you upload for AI analysis are sent to an AI provider to produce results. Only you, and a doctor you booked with, can see your records.',
      'This is a college demo - do not upload real patient data.']);
    const terms = () => infoModal('Terms of Use', ['CareVision AI provides AI-assisted pre-screening and information only. It is not a medical diagnosis or a replacement for a doctor.',
      'In an emergency call 112 or go to the nearest hospital.']);
    const map = {
      'Doctor Consultation': () => openBooking('General Medicine'), 'Lab Tests': () => Hub.open('lab'), 'Order Medicines': () => openModal('medicinesModal'),
      'Skincare': () => goAgent('agentSkinCard'), 'Care Programs': () => Hub.open('careplan'), 'Corporate Health': () => Hub.open('corporate'),
      'General Physician': () => openBooking('General Medicine'), 'Dermatologist': () => openBooking('Dermatology'),
      'Cardiologist': () => openBooking('Cardiology'), 'Pediatrician': () => openBooking('Pediatrics'),
      'Gynecologist': () => { toast('Gynecology doctors are coming soon - a General Physician can help first.', 'info'); openBooking('General Medicine'); },
      'About Us': about, 'Contact Us': contact, 'Blog': soon('Our blog'), 'Press': soon('The press page')
    };
    document.querySelectorAll('.footer-col a').forEach(a => {
      const fn = map[a.textContent.trim()];
      if (fn) a.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    });
    document.getElementById('linkPrivacy')?.addEventListener('click', (e) => { e.preventDefault(); privacy(); });
    document.getElementById('linkTerms')?.addEventListener('click', (e) => { e.preventDefault(); terms(); });
    document.getElementById('ctaBook')?.addEventListener('click', (e) => { e.preventDefault(); openBooking('General Medicine'); });
    // role cards: <button data-auth="login|register" data-note="...">
    document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => CareVisionAuth.open(b.dataset.note || '', b.dataset.auth, b.dataset.role)));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const [kind, arg] = b.dataset.open.split(':');
      if (kind === 'hub') Hub.open(arg); else if (kind === 'booking') openBooking(arg); else if (kind === 'agent') goAgent(arg);
    }));
  }
  document.addEventListener('DOMContentLoaded', wireLinks);

  return { el, toast, inr, when, day, badge, levelClass, overlay, closeAll, formModal, infoModal, printDoc, openBooking, goAgent, goTo };
})();
