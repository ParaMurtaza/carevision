/* ==========================================================================
   recommend.js - after any AI analysis:
     1) shows the best-matched doctors (ranked by the server)
     2) builds a printable "AI Health Report": findings, what to expect,
        advice, warning signs and recommended doctors with a Book button
   ========================================================================== */
const Recommend = (() => {
  const h = CV.el;
  const SOURCE_LABEL = { symptom: 'AI Symptom Checker', imaging: 'Scan & Report Analyst', skin: 'Skin Analyst' };

  function doctorCard(rec, { compact = false } = {}) {
    const d = rec.doctor;
    return h('div', { class: `rec-card${rec.label === 'Best match' ? ' best' : ''}` },
      h('div', { class: 'rec-top' },
        h('div', { class: 'doc-avatar', text: d.avatar || d.name[0] }),
        h('div', { class: 'rec-info' },
          h('strong', { text: d.name }),
          h('span', { class: 'rec-sub', text: `${d.specialty} · ★ ${Number(d.rating).toFixed(1)} · ${CV.inr(d.consultFee)}` })),
        CV.badge(rec.label, rec.label === 'Best match' ? 'good' : 'info')),
      compact ? null : h('ul', { class: 'rec-why' }, rec.reasons.slice(0, 4).map(r => h('li', { text: r }))),
      h('button', { class: 'btn-primary rec-book no-print', text: 'Book this doctor', onclick: () => bookWithDoctor(d) }));
  }

  // Opens your existing booking wizard already on the date/time step with this doctor selected
  function bookWithDoctor(d) {
    CV.closeAll();
    if (window.Dash) Dash.close();
    state.selectedSpeciality = d.specialty;
    openModal('bookingModal');
    goToBookingStep(2);
    const card = [...document.querySelectorAll('.doctor-card')].find(c => c.querySelector('h5')?.textContent === d.name);
    if (card) { card.click(); goToBookingStep(3); }
    else CV.toast('Please pick a doctor from the list.', 'info');
  }

  // Appended under an agent result: top doctors + button to open the full report
  async function afterAnalysis(box, source, result) {
    const spec = source === 'skin' ? 'Dermatology' : (result.recommendedSpecialist || 'General Medicine');
    const wrap = h('div', { class: 'rec-block' }, h('h5', { text: 'Best doctors for you' }), h('div', { class: 'ag-sub', text: 'Finding the best match...' }));
    box.append(wrap);
    try {
      const { doctors } = await CareVisionAPI.recommendDoctors(spec, result.urgency);
      wrap.replaceChildren(h('h5', { text: `Best doctors for you (${spec})` }), ...doctors.map(d => doctorCard(d, { compact: true })));
    } catch (e) { wrap.replaceChildren(h('div', { class: 'ag-error', text: 'Could not load doctor suggestions.' })); }

    const btn = h('button', { class: 'btn-primary ag-btn', text: '📄 Get my full AI Health Report' });
    btn.onclick = () => generate(source, result, btn);
    box.append(btn);
  }

  async function generate(source, analysis, btn) {
    if (!CareVisionAPI.isLoggedIn()) return CareVisionAuth.open('Log in to generate and save your AI Health Report');
    const old = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing your report...'; }
    try {
      const { report } = await CareVisionAPI.healthReport(source, analysis);
      showReport(report);
    } catch (e) { CV.toast(e.message, 'bad'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  }

  const list = (items) => h('ul', null, (items || []).map(i => h('li', { text: i })));
  const sec = (title, ...kids) => h('div', { class: 'rp-sec' }, h('h4', { text: title }), ...kids);

  function showReport(r) {
    const { box, close } = CV.overlay({ wide: true, paper: true });
    box.id = 'cvReportBox';
    const urgentText = { urgent: 'URGENT - see a doctor today', soon: 'See a doctor within 24-48 hours', routine: 'Routine - book a consultation' }[r.urgency] || '';

    box.append(
      h('div', { class: 'rp-head' },
        h('div', null, h('div', { class: 'rp-brand', text: 'CareVision AI' }), h('div', { class: 'rp-title', text: 'AI Health Report' })),
        h('div', { class: 'rp-meta' },
          h('div', { text: `Patient: ${r.patient?.name || ''}` }),
          h('div', { text: `Date: ${CV.day(r.generatedAt)}` }),
          h('div', { text: `Source: ${SOURCE_LABEL[r.source] || r.source}` }))),
      h('div', { class: `rp-banner ${r.urgency}` }, h('strong', { text: urgentText }), h('span', { text: ` ${r.followUp}` })),
      sec('Summary', h('p', { class: 'rp-lead', text: r.headline }), h('p', { text: r.whatItMeans }),
        h('p', { class: 'rp-spec', text: `Suggested department: ${r.speciality}` })),
      (r.keyFindings || []).length ? sec('Key findings', list(r.keyFindings)) : null,
      sec('What to expect - how you may feel', h('p', { text: r.recoveryOutlook })),
      sec('Advice for you', h('div', { class: 'rp-cols' },
        h('div', null, h('h5', { class: 'do', text: '✔ Do' }), list(r.dos)),
        h('div', null, h('h5', { class: 'dont', text: '✘ Avoid' }), list(r.donts)),
        h('div', null, h('h5', { text: '🌿 Lifestyle' }), list(r.lifestyle)))),
      h('div', { class: 'rp-sec rp-warn' }, h('h4', { text: '⚠ Seek care urgently if you notice' }), list(r.warningSigns)),
      sec('Recommended doctors', h('div', { class: 'rec-grid' }, (r.recommendedDoctors || []).map(d => doctorCard(d)))),
      h('p', { class: 'rp-disc', text: r.disclaimer }),
      h('div', { class: 'cv-actions no-print' },
        h('button', { class: 'btn-primary', text: '🖨 Print / Save as PDF', onclick: () => window.print() }),
        h('button', { class: 'btn-outline', text: 'Close', onclick: close })));
  }

  // Symptom checker: add a report button next to "Schedule Consult with Brief"
  function wireSymptomChecker() {
    const bookBtn = document.getElementById('briefBookBtn');
    if (!bookBtn) return;
    const btn = h('button', { class: 'btn-outline w-100 brief-report-btn', id: 'briefReportBtn', text: '📄 AI Health Report & Best Doctors' });
    btn.onclick = () => {
      if (!state.symptoms.length) return CV.toast('Tell the AI about your symptoms in the chat first.', 'warn');
      generate('symptom', {
        symptoms: state.symptoms, severity: state.severity, duration: state.duration, history: state.history,
        triageLevel: state.triageLevel, suggestedSpeciality: state.suggestedSpeciality, notes: state.notes
      }, btn);
    };
    bookBtn.after(btn);
  }

  document.addEventListener('DOMContentLoaded', wireSymptomChecker);
  return { afterAnalysis, showReport, generate, doctorCard, bookWithDoctor };
})();
