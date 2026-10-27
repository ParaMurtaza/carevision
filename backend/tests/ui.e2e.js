// UI test: drives the REAL pages in a simulated browser (jsdom) against the real server + database.
// Run:  npm run seed   (against a *_test database)   then   npm run test:ui
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.MONGO_URI = process.env.TEST_MONGO_URI || process.env.MONGO_URI || '';
if (!/test/i.test(process.env.MONGO_URI.split('?')[0])) {
  console.error('Refusing to run: use a database whose name contains "test" (set TEST_MONGO_URI) and seed it first.');
  process.exit(1);
}
const { JSDOM } = require('jsdom');
const app = require('../src/app');
const connect = require('../src/config/db');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + x)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PORT = 5201, URL_ = `http://localhost:${PORT}/`;

(async () => {
  await connect();
  const srv = app.listen(PORT);
  const errors = [];
  const dom = await JSDOM.fromURL(URL_, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, URL_).href, o);
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.print = () => {}; w.confirm = () => true;
      w.addEventListener('error', e => errors.push(e.message));
    }
  });
  const w = dom.window, d = w.document;
  await sleep(1500);
  const G = (n) => w.eval(n);               // reach top-level const/function objects of the page
  const $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const until = async (f, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = f(); if (v) return v; } catch {} await sleep(60); } return null; };
  const text = () => d.body.textContent;
  const active = () => $('doctorDashboard').classList.contains('active');
  const api = () => G('CareVisionAPI');

  // ---------- the demo patients are really gone ----------
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'script.js'), 'utf8');
  ok('script.js contains no demo patients', !/Sarah Connor|John Doe|You \(Active Case\)/.test(src));
  ok('script.js calls doctorQueue() and completeCase()', src.includes('CareVisionAPI.doctorQueue()') && src.includes('CareVisionAPI.completeCase('));
  ok('hero has no unsupported statistics', !/97\.4%|200K|1800\+|HIPAA/.test(d.documentElement.innerHTML));

  // ---------- access gates ----------
  click($('portalToggleBtn'));
  ok('logged out: Clinician Portal asks for login', $('cvAuthOverlay').classList.contains('open') && !active());
  G('CareVisionAuth').close();

  const email = 'pt' + Date.now() + '@x.com';
  await api().register({ name: 'Asha Verma', email, phone: '9876501234', password: 'secret12' });
  G('CareVisionAuth').renderNav();
  click($('portalToggleBtn')); await sleep(200);
  ok('patient is refused the Clinician Portal', !active() && text().includes('for doctors'));

  // patient makes an AI report, then books with a hostile payload in the brief
  await api().healthReport('symptom', { symptoms: ['chest pain'], severity: 9, duration: '3 days', triageLevel: 'High', suggestedSpeciality: 'Cardiology', notes: 'Chest pain.' });
  const evil = '<img src=x onerror="window.__xss=1">';
  w.eval(`state.selectedDoctor={name:'Dr. Christian Barnard',fee:'₹1200'};state.selectedSpeciality='Cardiology';state.selectedDate='2027-02-01';state.selectedTime='09:00 AM';
    state.symptoms=[${JSON.stringify(evil)},'chest pain'];state.severity=9;state.duration='3 days';state.history='Hypertension';state.triageLevel='High';
    state.notes=${JSON.stringify('<b>bold?</b> ' + evil)};
    state.chatTranscript=[{sender:'user',text:${JSON.stringify(evil)}},{sender:'ai',text:'How long has this been going on?'},{sender:'user',text:'3 days'}]`);
  await w.eval('submitBooking()'); await sleep(700);
  ok('booking saved (Jitsi video link)', ($('lobbyLink').href || '').includes('meet.jit.si'), $('lobbyLink').href);
  w.eval('closeModal()');
  G('CareVisionAuth').logout();

  // ---------- DOCTOR: clinician workspace connected to the backend ----------
  const docLogin = await api().login({ email: 'christian@carevision.test', password: 'Doctor@123' });
  G('CareVisionAuth').renderNav();
  w.__xss = undefined;
  click($('portalToggleBtn'));
  ok('doctor: Clinician Portal opens the workspace', await until(active));
  ok('queue is loaded from the API (1 real patient, no demo names)', await until(() => d.querySelectorAll('#ehrQueue .patient-queue-item').length === 1) && !text().includes('Sarah Connor') && !text().includes('John Doe'));
  const item = d.querySelector('#ehrQueue .patient-queue-item');
  ok('queue row shows patient + red triage dot', item.textContent.includes('Asha Verma') && !!item.querySelector('.pq-dot.red'));
  click(item); await sleep(300);
  ok('case header: name, triage, schedule', $('ehrPatientName').textContent === 'Asha Verma' && $('ehrPatientTriage').textContent === 'High Triage Risk' && $('ehrPatientTriage').classList.contains('badge-red') && $('ehrPatientMeta').textContent.includes('2027-02-01'));
  ok('AI brief: severity, duration, symptoms', $('ehrSeverityText').textContent === '9 / 10' && $('ehrDurationText').textContent === '3 days' && $('ehrSymptomsText').textContent.includes('chest pain'));
  ok('video call button points to the Jitsi room', !$('ehrJoinBtn').hidden && $('ehrJoinBtn').href.includes('meet.jit.si'));
  ok('chat transcript loaded from the booking (3 lines)', d.querySelectorAll('#ehrChatLog .log-row').length === 3);
  ok('patient AI report visible to the doctor', await until(() => $('ehrRecords').textContent.includes('AI Health Report')));
  ok('STORED-XSS BLOCKED: hostile patient text is shown as text, not run', !d.querySelector('#ehrChatLog img, #ehrSymptomsText img, #ehrQueue img, #ehrInferenceText img, #ehrInferenceText b') && w.__xss === undefined && $('ehrSymptomsText').textContent.includes('<img'));

  // prescription builder + closing the case
  click(d.querySelector('.prescription-builder button')); ok('adding a medicine without selecting is refused', d.querySelectorAll('#ehrPrescriptionsList .prescription-item').length === 0);
  $('ehrMedSelect').value = 'Paracetamol 650mg (Antipyretic)'; $('ehrDosageInput').value = '1-0-1 for 3 days';
  click(d.querySelector('.prescription-builder button'));
  ok('medicine added to prescription list', d.querySelectorAll('#ehrPrescriptionsList .prescription-item').length === 1);
  click($('ehrSubmitBtn')); await sleep(200);
  ok('closing a case without diagnosis is refused', text().includes('enter the diagnosis') && d.querySelectorAll('#ehrQueue .patient-queue-item').length === 1);
  $('ehrDiagInput').value = 'Suspected stable angina. Rest and avoid exertion.'; $('ehrLabsInput').value = 'ECG and lipid profile in 1 week';
  click($('ehrSubmitBtn'));
  ok('case closed -> queue empty + empty state', await until(() => text().includes('No patients waiting') && $('ehrPatientName').textContent === 'No patient selected'));

  // what the patient sees afterwards
  G('CareVisionAuth').logout();
  await api().login({ email, password: 'secret12' });
  const patientId = (await api().me()).user.id;
  const mine = (await api().myAppointments()).appointments.find(a => a.status === 'completed');
  ok('patient receives diagnosis, prescription and follow-up', mine && mine.diagnosis.includes('angina') && mine.prescription[0].includes('Paracetamol 650mg') && mine.followUp.includes('ECG'), JSON.stringify(mine));
  G('CareVisionAuth').logout();

  // a closed case cannot be closed again; other doctors never see this patient
  await api().login({ email: 'christian@carevision.test', password: 'Doctor@123' });
  let again = null; try { await api().completeCase(mine._id, { diagnosis: 'again' }); } catch (e) { again = e.message; }
  ok('API refuses to close the same case twice', !!again, again);
  G('CareVisionAuth').logout();
  await api().login({ email: 'alan@carevision.test', password: 'Doctor@123' });
  click($('portalToggleBtn'));
  ok('another doctor opens an empty queue (limited access)', await until(() => active() && text().includes('No patients waiting')));
  let denied = null; try { await api().patientRecords(patientId); } catch (e) { denied = e.message; }
  ok("another doctor is refused this patient's records", !!denied && denied.includes('only view patients who booked with you'), denied);
  w.eval('closeClinicianWorkspace()');
  G('CareVisionAuth').logout();

  // doctor history/profile + dashboard hand-off
  await api().login({ email: 'christian@carevision.test', password: 'Doctor@123' }); G('CareVisionAuth').renderNav();
  w.eval("Dash.open('history')");
  ok('doctor history tab lists the closed case with follow-up', await until(() => d.querySelector('.dash') && text().includes('Suspected stable angina') && text().includes('ECG and lipid profile')));
  click([...d.querySelectorAll('.d-tab')].find(b => b.textContent.includes('Clinician Workspace')));
  ok('"Clinician Workspace" tab opens the connected workspace', await until(() => active() && !d.querySelector('.dash')));
  w.eval('closeClinicianWorkspace()'); G('CareVisionAuth').logout();

  // ---------- ADMIN ----------
  await api().login({ email: 'admin@carevision.test', password: process.env.ADMIN_PASSWORD || 'Admin@123' }); G('CareVisionAuth').renderNav();
  click($('portalToggleBtn'));
  ok('admin gets the Admin Panel (not the doctor workspace)', await until(() => d.querySelector('.dash') && text().includes('Clinic overview')) && !active());
  ok('no uncaught JavaScript errors', errors.length === 0, errors.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
