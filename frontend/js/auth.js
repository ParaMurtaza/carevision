/* ==========================================================================
   auth.js - the login / sign-up window (three portals), role-aware navigation,
   and loading the real doctors from the database.
   Loaded AFTER script.js (uses doctorsData from there).
   ========================================================================== */
const CareVisionAuth = (() => {
  const h = CV.el;

  const ROLES = {
    patient: {
      label: 'Patient', icon: '🧑', nav: 'My Dashboard', canRegister: true,
      title: 'Patient log in', brandTitle: 'Your health, all in one place',
      points: ['AI symptom check & personal Health Report', 'Video consultations with matched doctors', 'Prescriptions, labs and orders in one dashboard']
    },
    doctor: {
      label: 'Doctor', icon: '🩺', nav: 'Clinician Portal', canRegister: false,
      title: 'Clinician Portal', brandTitle: 'Your consultation workspace',
      points: ['Live patient queue sorted by AI triage', 'AI case brief, chat log and patient reports', 'Video call, diagnosis and e-prescription'],
      note: 'Doctor accounts are created by the clinic admin.'
    },
    admin: {
      label: 'Admin', icon: '🛡️', nav: 'Admin Panel', canRegister: false,
      title: 'Admin Panel', brandTitle: 'Run the whole clinic',
      points: ['Revenue, appointments and AI usage at a glance', 'Add and manage doctors, fees and users', 'Track orders and service requests'],
      note: 'Admin access is limited to clinic administrators.'
    }
  };
  const DEMO = { patient: ['patient@carevision.test', 'Patient@123'], doctor: ['christian@carevision.test', 'Doctor@123'], admin: ['admin@carevision.test', 'Admin@123'] };
  const showDemo = ['localhost', '127.0.0.1'].includes(location.hostname) || location.search.includes('demo=1');

  let mode = 'login', role = 'patient', explicit = false, ui = {};

  /* ---------- build the window once ---------- */
  function build() {
    const input = (id, type, ph, extra = {}) => h('input', { id, type, placeholder: ph, autocomplete: extra.ac || 'off', ...extra.attrs });
    ui.brandIcon = h('div', { class: 'auth-brand-icon' });
    ui.brandTitle = h('h3', { class: 'auth-brand-title' });
    ui.brandList = h('ul', { class: 'auth-brand-list' });
    ui.tabs = h('div', { class: 'auth-tabs', role: 'tablist' });
    ui.title = h('h3', { id: 'cvAuthTitle', class: 'auth-title' });
    ui.note = h('p', { id: 'cvAuthNote', class: 'auth-note' });
    ui.name = input('cvName', 'text', 'Full name', { ac: 'name' });
    ui.email = input('cvEmail', 'email', 'Email address', { ac: 'email' });
    ui.phone = input('cvPhone', 'tel', 'Phone (optional)', { ac: 'tel' });
    ui.pass = input('cvPass', 'password', 'Password', { ac: 'current-password' });
    ui.eye = h('button', { type: 'button', class: 'auth-eye', 'aria-label': 'Show password', text: '👁', onclick: () => {
      const show = ui.pass.type === 'password'; ui.pass.type = show ? 'text' : 'password';
      ui.eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); ui.eye.textContent = show ? '🙈' : '👁';
    } });
    ui.hint = h('div', { class: 'auth-hint' });
    ui.error = h('p', { id: 'cvAuthError', class: 'auth-error', role: 'alert', 'aria-live': 'polite' });
    ui.submit = h('button', { id: 'cvAuthSubmit', class: 'btn-primary auth-submit', type: 'button', onclick: submit });
    ui.switch = h('a', { id: 'cvAuthSwitch', href: '#', onclick: (e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); } });
    ui.switchRow = h('p', { class: 'auth-switch' }, ui.switch);
    ui.demo = h('div', { class: 'auth-demo' });
    ui.fields = { name: h('div', { class: 'auth-field' }, ui.name), phone: h('div', { class: 'auth-field' }, ui.phone) };

    const card = h('div', { class: 'auth-card' },
      h('aside', { class: 'auth-brand' }, h('div', { class: 'auth-logo', text: 'CareVision AI' }), ui.brandIcon, ui.brandTitle, ui.brandList,
        h('small', { class: 'auth-brand-foot', text: 'AI-assisted pre-screening · not a medical diagnosis' })),
      h('div', { class: 'auth-form' },
        h('button', { class: 'cv-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: close }),
        ui.tabs, ui.title, ui.note,
        ui.fields.name, h('div', { class: 'auth-field' }, ui.email), ui.fields.phone,
        h('div', { class: 'auth-field auth-pass' }, ui.pass, ui.eye), ui.hint, ui.error, ui.submit, ui.switchRow, ui.demo));

    ui.overlay = h('div', { id: 'cvAuthOverlay', class: 'cv-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cvAuthTitle' }, card);
    ui.overlay.addEventListener('mousedown', (e) => { if (e.target === ui.overlay) close(); });
    ui.overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') submit(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.overlay.classList.contains('open')) close(); });
    ui.pass.addEventListener('input', strengthHint);
    document.body.append(ui.overlay);
  }

  /* ---------- state -> screen ---------- */
  function render() {
    const R = ROLES[role], reg = mode === 'register' && R.canRegister;
    ui.tabs.replaceChildren(...Object.entries(ROLES).map(([key, r]) =>
      h('button', { type: 'button', role: 'tab', class: `auth-tab${key === role ? ' active' : ''}`, 'aria-selected': String(key === role), text: `${r.icon} ${r.label}`,
        onclick: () => { role = key; explicit = true; mode = 'login'; clearError(); render(); } })));
    ui.brandIcon.textContent = R.icon;
    ui.brandTitle.textContent = R.brandTitle;
    ui.brandList.replaceChildren(...R.points.map(p => h('li', { text: p })));
    ui.title.textContent = reg ? 'Create your patient account' : R.title;
    ui.fields.name.style.display = ui.fields.phone.style.display = reg ? '' : 'none';
    ui.pass.autocomplete = reg ? 'new-password' : 'current-password';
    ui.submit.textContent = reg ? 'Create account' : 'Log in';
    ui.hint.textContent = '';
    // register link only for patients; doctors / admins see where their account comes from
    ui.switchRow.style.display = '';
    if (R.canRegister) { ui.switch.style.display = ''; ui.switch.textContent = reg ? 'Already have an account? Log in' : 'New patient? Create an account'; ui.switchRow.childNodes.forEach(n => { if (n.nodeType === 3) n.remove(); }); }
    else { ui.switch.style.display = 'none'; ui.switchRow.childNodes.forEach(n => { if (n.nodeType === 3) n.remove(); }); ui.switchRow.append(document.createTextNode(R.note)); }
    // demo account shortcut (localhost or ?demo=1 only)
    ui.demo.replaceChildren();
    if (showDemo && !reg) {
      ui.demo.append(h('small', { text: 'Demo account:' }), h('button', { type: 'button', class: 'auth-chip', text: `Use demo ${R.label.toLowerCase()}`,
        onclick: () => { ui.email.value = DEMO[role][0]; ui.pass.value = DEMO[role][1]; clearError(); } }));
    }
  }

  function setMode(m) { mode = m; clearError(); render(); (m === 'register' ? ui.name : ui.email).focus(); }
  function clearError() { ui.error.textContent = ''; [ui.name, ui.email, ui.phone, ui.pass].forEach(i => i.classList.remove('invalid')); }
  function fail(msg, field) {
    ui.error.textContent = msg;
    if (field) field.classList.add('invalid');
    ui.error.closest('.auth-form').classList.remove('shake'); void ui.error.offsetWidth; ui.error.closest('.auth-form').classList.add('shake');
    if (field) field.focus();
  }
  function strengthHint() {
    if (mode !== 'register') return;
    const p = ui.pass.value;
    ui.hint.textContent = !p ? '' : p.length < 6 ? 'Use at least 6 characters' : p.length < 10 ? 'OK - a longer password is stronger' : 'Strong password';
    ui.hint.className = 'auth-hint ' + (p.length < 6 ? 'bad' : 'good');
  }

  /* ---------- submit ---------- */
  async function submit() {
    if (ui.submit.disabled) return;
    clearError();
    const email = ui.email.value.trim(), password = ui.pass.value, reg = mode === 'register' && ROLES[role].canRegister;
    if (reg && !ui.name.value.trim()) return fail('Please enter your full name.', ui.name);
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.', ui.email);
    if (!password) return fail('Enter your password.', ui.pass);
    if (reg && password.length < 6) return fail('Your password needs at least 6 characters.', ui.pass);

    ui.submit.disabled = true; ui.submit.textContent = reg ? 'Creating account...' : 'Logging in...';
    try {
      const res = reg
        ? await CareVisionAPI.register({ name: ui.name.value.trim(), email, password, phone: ui.phone.value.trim() })
        : await CareVisionAPI.login({ email, password });
      // chose a specific portal but used another kind of account -> refuse, point to the right tab
      if (explicit && res.user.role !== role) {
        CareVisionAPI.logout();
        const right = res.user.role;
        role = right; mode = 'login'; render(); ui.email.value = email; ui.pass.value = '';
        return fail(`That is a ${ROLES[right].label.toLowerCase()} account, so we switched to the ${ROLES[right].label} tab. Please log in again.`, ui.pass);
      }
      close();
      renderNav();
      CV.toast(`Welcome${reg ? '' : ' back'}, ${res.user.name.split(' ')[0]}!`, 'good');
      if (res.user.role !== 'patient') Dash.open();     // doctor -> Clinician Workspace, admin -> Admin Panel
    } catch (e) {
      fail(e.message, /password|incorrect/i.test(e.message) ? ui.pass : ui.email);
    } finally {
      ui.submit.disabled = false; render();
    }
  }

  /* ---------- public ---------- */
  // open(note, 'login'|'register', 'patient'|'doctor'|'admin')   (role is optional)
  function open(note = '', m = 'login', r) {
    if (r && ROLES[r]) { role = r; explicit = true; } else { role = 'patient'; explicit = false; }
    mode = m === 'register' ? 'register' : 'login';
    ui.pass.value = ''; ui.pass.type = 'password'; ui.eye.textContent = '👁';
    clearError(); render();
    ui.note.textContent = note || '';
    ui.note.style.display = note ? '' : 'none';
    ui.overlay.classList.add('open');
    setTimeout(() => (mode === 'register' ? ui.name : ui.email).focus(), 60);
  }
  function close() { ui.overlay.classList.remove('open'); }

  function logout() {
    CareVisionAPI.logout();
    Dash.close();
    if (typeof closeClinicianWorkspace === 'function') closeClinicianWorkspace();
    renderNav();
    CV.toast('You have been logged out.', 'info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderNav() {
    const cta = document.querySelector('.nav-cta');
    if (!cta) return;
    let slot = document.getElementById('cvNavUser');
    if (!slot) { slot = h('span', { id: 'cvNavUser', class: 'cv-navuser' }); cta.prepend(slot); }
    slot.replaceChildren();
    const user = CareVisionAPI.getUser();
    const clinicianBtn = document.getElementById('navDoctorBtn');
    if (clinicianBtn) clinicianBtn.style.display = user ? 'none' : '';
    if (user) {
      slot.append(
        h('span', { class: 'cv-hello', text: `Hi, ${user.name.split(' ')[0]}` }),
        h('a', { href: '#', class: 'btn-outline', id: 'navDashBtn', text: (ROLES[user.role] || ROLES.patient).nav, onclick: (e) => { e.preventDefault(); Dash.open(); } }),
        h('a', { href: '#', class: 'btn-outline', id: 'navLogoutBtn', text: 'Logout', onclick: (e) => { e.preventDefault(); logout(); } }));
    } else {
      slot.append(h('a', { href: '#', class: 'btn-outline', id: 'navLoginBtn', text: 'Log in', onclick: (e) => { e.preventDefault(); open(); } }));
    }
  }

  // Replace the hard-coded demo doctors with the real ones from MongoDB
  async function syncDoctors() {
    try {
      const { doctors } = await CareVisionAPI.getDoctors();
      if (!doctors.length) return;
      Object.keys(doctorsData).forEach(k => delete doctorsData[k]);
      doctors.forEach(d => {
        (doctorsData[d.specialty] = doctorsData[d.specialty] || []).push({
          name: d.name, rating: d.rating, fee: '₹' + d.consultFee, avatar: d.avatar,
          avail: d.availability && d.availability.length ? `${d.availability.length} slots today` : 'Fully booked'
        });
      });
    } catch (e) { console.warn('Using built-in demo doctors (API unreachable)'); }
  }

  document.addEventListener('DOMContentLoaded', () => { build(); render(); renderNav(); syncDoctors(); });
  return { open, close, renderNav, logout };
})();
