/* ==========================================================================
   dashboard.js - one full-screen dashboard, three role-based versions:
     patient : overview, appointments, AI reports, orders, profile
     doctor  : patient queue (only own patients), completed, profile
     admin   : (clinic admin) stats, doctors, users, appointments, requests
   The server enforces the same rules - hiding a tab here is only for looks.
   ========================================================================== */
const Dash = (() => {
  const h = CV.el;
  const api = CareVisionAPI;
  let root = null, main = null, nav = null;

  const TABS = {
    patient: [['overview', '🏠 Overview'], ['appointments', '📅 Appointments'], ['reports', '🧾 AI Reports'], ['orders', '🛒 Orders & Services'], ['profile', '👤 Profile']],
    doctor: [['queue', '🩺 Clinician Workspace'], ['history', '✅ Completed'], ['profile', '👤 My Profile']],
    admin: [['overview', '📊 Overview'], ['doctors', '👨‍⚕️ Doctors'], ['users', '👥 Users'], ['appointments', '📅 Appointments'], ['requests', '📦 Requests']]
  };

  /* ---------- small building blocks ---------- */
  const card = (title, ...kids) => h('div', { class: 'd-card' }, title ? h('h4', { text: title }) : null, ...kids);
  const stat = (label, value, sub) => h('div', { class: 'd-stat' }, h('div', { class: 'd-num', text: value }), h('div', { class: 'd-label', text: label }), sub ? h('div', { class: 'd-sub', text: sub }) : null);
  const empty = (msg, ...actions) => h('div', { class: 'd-empty' }, h('p', { text: msg }), ...actions);
  const btn = (text, fn, cls = 'btn-outline') => h('button', { class: `${cls} d-btn`, text, onclick: fn });
  const table = (heads, rows) => h('div', { class: 'd-tablewrap' }, h('table', { class: 'd-table' },
    h('thead', null, h('tr', null, heads.map(t => h('th', { text: t })))),
    h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c)))))));
  const closeThen = (fn) => () => { close(); fn(); };

  /* ---------- open / close / tabs ---------- */
  function open(tab) {
    const user = api.getUser();
    if (!user) return CareVisionAuth.open('Please log in to open your dashboard');
    close();
    const tabs = TABS[user.role];
    nav = h('div', { class: 'd-nav' });
    main = h('main', { class: 'd-main' });
    root = h('div', { class: 'dash' },
      h('aside', { class: 'd-side' },
        h('div', { class: 'd-brand', text: 'CareVision AI' }),
        h('div', { class: 'd-user' }, h('strong', { text: user.name }), CV.badge(user.role === 'admin' ? 'Admin' : user.role, 'info')),
        nav,
        h('div', { class: 'd-side-foot' },
          btn('← Back to site', close), btn('Logout', () => CareVisionAuth.logout()))),
      main);
    document.body.append(root);
    document.body.classList.add('no-scroll');
    show(tabs.some(t => t[0] === tab) ? tab : tabs[0][0]);
  }

  function close() {
    if (root) { root.remove(); root = null; }
    document.body.classList.remove('no-scroll');
  }

  async function show(tab) {
    const user = api.getUser(); if (!user || !root) return;
    nav.replaceChildren(...TABS[user.role].map(([id, label]) =>
      h('button', { class: `d-tab${id === tab ? ' active' : ''}`, text: label, onclick: () => show(id) })));
    main.replaceChildren(h('p', { class: 'd-loading', text: 'Loading...' }));
    try {
      const node = await VIEWS[user.role][tab]();
      main.replaceChildren(node);
      main.scrollTop = 0;
    } catch (e) {
      main.replaceChildren(empty(e.message, btn('Try again', () => show(tab), 'btn-primary')));
    }
  }

  // Clinician Portal buttons: doctors and the admin only (limited access)
  function openClinician() {
    const user = api.getUser();
    if (!user) return CareVisionAuth.open('Clinician Portal - doctors and clinic staff only. Please log in with your clinic account.', 'login', 'doctor');
    if (user.role === 'patient') return CV.toast('The Clinician Portal is for doctors. Patients can use "My Dashboard".', 'warn');
    if (user.role === 'doctor') return openClinicianWorkspace();
    open();   // the admin gets the Admin Panel
  }

  /* ===================== PATIENT ===================== */
  async function pOverview() {
    const user = api.getUser();
    const [a, r, o] = await Promise.all([api.myAppointments(), api.agentHistory(), api.myRequests()]);
    const upcoming = a.appointments.filter(x => x.status === 'booked');
    const actions = [
      ['🩺', 'Check symptoms', 'AI chat builds your case brief', () => CV.goTo('demo')],
      ['🩻', 'Analyse scan / report', 'MRI, CT, X-ray or lab report', () => CV.goAgent('agentImagingCard')],
      ['🌸', 'Skin analysis', 'Upload a photo of the area', () => CV.goAgent('agentSkinCard')],
      ['📅', 'Book a doctor', 'Video consultation', () => CV.openBooking('General Medicine')],
      ['🧪', 'Lab tests & scans', 'Home sample collection', () => Hub.open('lab')],
      ['💊', 'Order medicines', 'Compare prices', () => openModal('medicinesModal')]
    ];
    return h('div', null,
      h('h2', { text: `Welcome, ${user.name.split(' ')[0]} 👋` }),
      h('p', { class: 'd-muted', text: 'Everything about your care in one place.' }),
      h('div', { class: 'd-stats' }, stat('Upcoming consults', upcoming.length), stat('AI reports & analyses', r.items.length), stat('Orders & services', o.requests.length)),
      card('Quick actions', h('div', { class: 'd-actions' }, actions.map(([icon, t, s, fn]) =>
        h('button', { class: 'd-action', onclick: closeThen(fn) }, h('span', { class: 'd-ico', text: icon }), h('strong', { text: t }), h('small', { text: s }))))),
      upcoming[0] ? card('Next appointment', apptRow(upcoming[0])) : card('Next appointment', empty('No upcoming appointments.', btn('Book now', closeThen(() => CV.openBooking('General Medicine')), 'btn-primary'))));
  }

  function apptRow(a) {
    const doc = a.doctorId || {};
    return h('div', { class: 'd-row' },
      h('div', { class: 'd-row-main' },
        h('strong', { text: doc.name || 'Doctor' }),
        h('span', { class: 'd-muted', text: ` · ${doc.specialty || ''}` }),
        h('div', { class: 'd-muted', text: `${a.date} at ${a.slot}` }),
        a.symptomBrief?.triageLevel ? h('div', null, CV.badge(`Triage: ${a.symptomBrief.triageLevel}`, CV.levelClass(a.symptomBrief.triageLevel))) : null,
        a.status === 'completed' ? h('div', { class: 'd-diag' }, h('strong', { text: 'Diagnosis: ' }), a.diagnosis,
          (a.prescription || []).length ? h('ul', null, a.prescription.map(p => h('li', { text: p }))) : null,
          a.followUp ? h('div', null, h('strong', { text: 'Follow-up / tests: ' }), a.followUp) : null) : null),
      h('div', { class: 'd-row-side' }, CV.badge(a.status, CV.levelClass(a.status)),
        a.status === 'booked' ? h('a', { class: 'btn-primary d-btn', href: a.meetLink, target: '_blank', rel: 'noopener', text: 'Join video' }) : null,
        a.status === 'booked' ? btn('Cancel', async () => { if (confirm('Cancel this appointment?')) { await api.cancelAppointment(a._id); CV.toast('Appointment cancelled', 'info'); show('appointments'); } }) : null,
        a.status === 'completed' && (a.prescription || []).length ? btn('Print prescription', () => CV.printDoc('Prescription', [
          { h: 'Doctor', lines: [`${doc.name} (${doc.specialty})`, `Date: ${a.date}`] }, { h: 'Diagnosis', lines: [a.diagnosis] }, { h: 'Prescription', lines: a.prescription }].concat(a.followUp ? [{ h: 'Follow-up / tests', lines: [a.followUp] }] : []))) : null));
  }

  async function pAppointments() {
    const { appointments } = await api.myAppointments();
    return h('div', null, h('h2', { text: 'My appointments' }),
      appointments.length ? card(null, ...appointments.map(apptRow))
        : card(null, empty('You have not booked any appointments yet.', btn('Book a doctor', closeThen(() => CV.openBooking('General Medicine')), 'btn-primary'))));
  }

  const ICON = { imaging: '🩻', skin: '🌸', report: '📄' };
  const NAME = { imaging: 'Scan / report analysis', skin: 'Skin analysis', report: 'AI Health Report' };

  async function pReports() {
    const [hist, docs] = await Promise.all([api.agentHistory(), api.myReports()]);
    const items = hist.items.map(i => h('div', { class: 'd-row' },
      h('div', { class: 'd-row-main' }, h('strong', { text: `${ICON[i.agent] || ''} ${NAME[i.agent] || i.agent}` }),
        h('div', { class: 'd-muted', text: CV.when(i.createdAt) + (i.fileName ? ` · ${i.fileName}` : '') }), h('div', { text: i.summary || '' })),
      h('div', { class: 'd-row-side' }, i.urgency ? CV.badge(i.urgency, CV.levelClass(i.urgency)) : null,
        btn(i.agent === 'report' ? 'Open report' : 'Make health report', () => {
          if (i.agent === 'report') Recommend.showReport(i.result);
          else Recommend.generate(i.agent, i.result);
        }, 'btn-primary'))));
    const files = docs.reports.map(r => h('div', { class: 'd-row' },
      h('div', { class: 'd-row-main' }, h('strong', { text: `📎 ${r.originalName}` }), h('div', { class: 'd-muted', text: `${r.type} · ${CV.when(r.uploadedAt)}` }),
        h('div', { text: r.aiSummary || '' }), (r.findings || []).length ? h('ul', null, r.findings.map(f => h('li', { text: f }))) : null)));
    return h('div', null, h('h2', { text: 'My AI reports' }),
      card('AI analyses & health reports', items.length ? items : empty('Nothing yet. Run the symptom checker or an AI agent.',
        btn('Try an AI agent', closeThen(() => CV.goAgent('agents')), 'btn-primary'))),
      card('Uploaded documents', files.length ? files : empty('No uploaded documents. Use the "Upload Report" button on the site.')));
  }

  async function pOrders() {
    const { requests } = await api.myRequests();
    const TYPE = { lab: '🧪 Lab test', scan: '🩻 Scan', careplan: '🌿 Care plan', corporate: '🏢 Corporate', medicine: '💊 Medicines' };
    return h('div', null, h('h2', { text: 'Orders & services' }),
      h('div', { class: 'd-toolbar' }, btn('Lab tests & scans', closeThen(() => Hub.open('lab')), 'btn-primary'), btn('Care plans', closeThen(() => Hub.open('careplan'))), btn('Order medicines', closeThen(() => openModal('medicinesModal')))),
      card(null, requests.length ? requests.map(r => h('div', { class: 'd-row' },
        h('div', { class: 'd-row-main' }, h('strong', { text: `${TYPE[r.type]} - ${r.title}` }),
          h('div', { class: 'd-muted', text: `Ref CV-${String(r._id).slice(-6).toUpperCase()} · ${CV.when(r.createdAt)}${r.preferredDate ? ' · for ' + r.preferredDate : ''}` }),
          (r.items || []).length ? h('div', { class: 'd-muted', text: r.items.map(i => `${i.name} ×${i.qty}`).join(', ') }) : null),
        h('div', { class: 'd-row-side' }, r.amount ? h('strong', { text: CV.inr(r.amount) }) : null, CV.badge(r.status, CV.levelClass(r.status)),
          r.status === 'requested' ? btn('Cancel', async () => { await api.cancelRequest(r._id); CV.toast('Request cancelled', 'info'); show('orders'); }) : null)))
        : empty('No orders yet.')));
  }

  function profileForm(user, extra) {
    const name = h('input', { value: user.name, maxlength: 80 });
    const phone = h('input', { value: user.phone || '', maxlength: 20, placeholder: 'Phone' });
    const msg = h('p', { class: 'cv-error' });
    return card('Account', h('label', { class: 'cv-label', text: 'Full name' }, name), h('label', { class: 'cv-label', text: 'Phone' }, phone),
      h('label', { class: 'cv-label', text: 'Email (cannot be changed)' }, h('input', { value: user.email || '', disabled: true })),
      msg, btn('Save changes', async () => {
        try { await api.updateProfile({ name: name.value, phone: phone.value }); CV.toast('Profile updated', 'good'); CareVisionAuth.renderNav(); }
        catch (e) { msg.textContent = e.message; }
      }, 'btn-primary'), extra);
  }
  async function pProfile() {
    const { user } = await api.me();
    return h('div', null, h('h2', { text: 'My profile' }), profileForm(user));
  }

  /* ===================== DOCTOR ===================== */
  // The patient queue lives in the Clinician Workspace (script.js), connected to the backend.
  // This tab simply opens it, so there is only ONE clinician UI to maintain.
  async function dQueue() { close(); openClinicianWorkspace(); return h('div'); }

  async function dHistory() {
    const { queue } = await api.doctorHistory();
    return h('div', null, h('h2', { text: 'Completed consultations' }),
      queue.length ? table(['Patient', 'Date', 'Diagnosis', 'Prescription', 'Follow-up'], queue.map(a => [a.userId?.name || '', `${a.date} ${a.slot}`, a.diagnosis || '', (a.prescription || []).join('; '), a.followUp || '']))
        : card(null, empty('No completed consultations yet.')));
  }

  async function dProfile() {
    const { doctor } = await api.doctorMe();
    return h('div', null, h('h2', { text: 'My profile' }),
      card('Public profile', h('div', { class: 'brief-grid' },
        h('div', null, h('small', { text: 'Name' }), h('div', { text: doctor.name })), h('div', null, h('small', { text: 'Speciality' }), h('div', { text: doctor.specialty })),
        h('div', null, h('small', { text: 'Licence no.' }), h('div', { text: doctor.licenseNo })), h('div', null, h('small', { text: 'Rating' }), h('div', { text: `★ ${doctor.rating}` })),
        h('div', null, h('small', { text: 'Consultation fee' }), h('div', { text: CV.inr(doctor.consultFee) }))),
        h('h5', { text: 'Daily slots' }), h('div', { class: 'chips' }, (doctor.availability || []).map(s => h('span', { class: 'chip', text: s }))),
        h('p', { class: 'd-muted', text: 'Fee and slots are managed by the clinic admin.' })),
      profileForm(api.getUser()));
  }

  /* ===================== ADMIN ===================== */
  async function aOverview() {
    const s = await api.adminStats();
    const apt = s.appointments, max = Math.max(1, ...s.last7Days.map(d => d.count));
    const total = Object.values(apt).reduce((a, b) => a + b, 0);
    return h('div', null, h('h2', { text: 'Clinic overview' }),
      h('div', { class: 'd-stats' }, stat('Patients', s.patients), stat('Doctors', s.doctors), stat('Appointments', total, `${apt.booked || 0} booked · ${apt.completed || 0} done · ${apt.cancelled || 0} cancelled`),
        stat('Revenue (est.)', CV.inr(s.revenue.total), `Consults ${CV.inr(s.revenue.consultations)} · Services ${CV.inr(s.revenue.services)}`)),
      h('div', { class: 'd-two' },
        card('New appointments - last 7 days', h('div', { class: 'bars' }, s.last7Days.map(d => h('div', { class: 'bar-col' },
          h('div', { class: 'bar-val', text: d.count }), h('div', { class: 'bar', style: `height:${Math.max(4, (d.count / max) * 120)}px` }), h('div', { class: 'bar-lbl', text: d.date.slice(5) }))))),
        card('AI & services usage',
          h('ul', { class: 'd-list' }, h('li', { text: `Health reports generated: ${s.aiUsage.report || 0}` }), h('li', { text: `Scan / report analyses: ${s.aiUsage.imaging || 0}` }), h('li', { text: `Skin analyses: ${s.aiUsage.skin || 0}` }),
            h('li', { text: `Service requests: ${Object.values(s.requests).reduce((a, b) => a + b, 0)} (${s.requests.requested || 0} pending)` })))));
  }

  async function aDoctors() {
    const { doctors } = await api.getDoctors();
    const rows = doctors.map(d => {
      const fee = h('input', { type: 'number', value: d.consultFee, min: 1, class: 'fee-input' });
      return [d.name, d.specialty, d.licenseNo, `★ ${d.rating}`, h('span', { class: 'fee-cell' }, fee, btn('Save', async () => { try { await api.adminUpdateDoctor(d._id, { consultFee: fee.value }); CV.toast('Fee updated', 'good'); } catch (e) { CV.toast(e.message, 'bad'); } })),
        btn('Remove', async () => { if (confirm(`Remove ${d.name}? Their login will be deleted.`)) { try { await api.adminDeleteDoctor(d._id); CV.toast('Doctor removed', 'info'); show('doctors'); } catch (e) { CV.toast(e.message, 'bad'); } } })];
    });
    return h('div', null, h('h2', { text: 'Doctors' }),
      h('div', { class: 'd-toolbar' }, btn('+ Add doctor', () => CV.formModal({
        title: 'Add a doctor', intro: 'This creates the doctor\'s login and public profile.',
        fields: [{ name: 'name', label: 'Full name (e.g. Dr. Asha Rao)', required: true }, { name: 'email', label: 'Login email', type: 'email', required: true },
          { name: 'password', label: 'Temporary password (min 6)', type: 'password', required: true },
          { name: 'specialty', label: 'Speciality', type: 'select', options: ['General Medicine', 'Dermatology', 'Cardiology', 'Pediatrics'] },
          { name: 'licenseNo', label: 'Licence number', required: true }, { name: 'consultFee', label: 'Consultation fee (₹)', type: 'number', required: true, min: 1 }],
        submitText: 'Create doctor', onSubmit: async (v) => { await api.adminAddDoctor(v); CV.toast('Doctor added', 'good'); show('doctors'); }
      }), 'btn-primary')),
      card(null, table(['Name', 'Speciality', 'Licence', 'Rating', 'Fee (₹)', ''], rows)));
  }

  async function aUsers() {
    const { users } = await api.adminUsers();
    return h('div', null, h('h2', { text: 'Users' }),
      card(null, table(['Name', 'Email', 'Role', 'Joined', 'Status', ''], users.map(u => [u.name, u.email, u.role, CV.day(u.createdAt),
        CV.badge(u.active === false ? 'disabled' : 'active', u.active === false ? 'bad' : 'good'),
        u.role === 'admin' ? '' : btn(u.active === false ? 'Enable' : 'Disable', async () => { try { await api.adminToggleUser(u._id); show('users'); } catch (e) { CV.toast(e.message, 'bad'); } })]))));
  }

  async function aAppointments() {
    const { appointments } = await api.adminAppointments();
    return h('div', null, h('h2', { text: 'All appointments' }),
      card(null, appointments.length ? table(['Patient', 'Doctor', 'When', 'Triage', 'Status'], appointments.map(a => [a.userId?.name || '-', a.doctorId?.name || '-', `${a.date} ${a.slot}`,
        a.symptomBrief?.triageLevel ? CV.badge(a.symptomBrief.triageLevel, CV.levelClass(a.symptomBrief.triageLevel)) : '-', CV.badge(a.status, CV.levelClass(a.status))])) : empty('No appointments yet.')));
  }

  async function aRequests() {
    const { requests } = await api.adminRequests();
    return h('div', null, h('h2', { text: 'Service requests & orders' }),
      card(null, requests.length ? table(['Ref', 'Customer', 'Service', 'Amount', 'Details', 'Status'], requests.map(r => {
        const sel = h('select', { onchange: async () => { try { await api.adminSetRequest(r._id, sel.value); CV.toast('Status updated', 'good'); } catch (e) { CV.toast(e.message, 'bad'); } } },
          ['requested', 'confirmed', 'completed', 'cancelled'].map(s => h('option', { value: s, text: s, selected: s === r.status })));
        const c = r.contact || {};
        return [`CV-${String(r._id).slice(-6).toUpperCase()}`, `${r.userId?.name || ''} ${c.phone ? '(' + c.phone + ')' : ''}`, r.title, r.amount ? CV.inr(r.amount) : '-',
          [c.company && `${c.company} (${c.employees})`, c.address, r.preferredDate].filter(Boolean).join(' · '), sel];
      })) : empty('No service requests yet.')));
  }

  const VIEWS = {
    patient: { overview: pOverview, appointments: pAppointments, reports: pReports, orders: pOrders, profile: pProfile },
    doctor: { queue: dQueue, history: dHistory, profile: dProfile },
    admin: { overview: aOverview, doctors: aDoctors, users: aUsers, appointments: aAppointments, requests: aRequests }
  };

  // bind the two clinician buttons (script.js no longer opens the old demo EHR)
  document.addEventListener('DOMContentLoaded', () => {
    ['navDoctorBtn', 'portalToggleBtn'].forEach(id => document.getElementById(id)?.addEventListener('click', (e) => { e.preventDefault(); openClinician(); }));
  });

  return { open, close, show, openClinician };
})();
