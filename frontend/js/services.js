/* ==========================================================================
   services.js - the Services Hub: lab tests, scans, care plans, corporate
   plans and medicine checkout. Every request is saved in MongoDB and shows
   up in the patient's dashboard and in the admin panel.
   ========================================================================== */
const Hub = (() => {
  const h = CV.el;
  const TABS = [['lab', '🧪 Lab tests'], ['scan', '🩻 Scans'], ['careplan', '🌿 Care plans'], ['corporate', '🏢 Corporate']];
  const BUTTON = { lab: 'Book home collection', scan: 'Book scan', careplan: 'Subscribe', corporate: 'Request a quote' };
  let catalog = null, ctx = null;

  async function open(tab = 'lab') {
    close();
    const { box, close: c } = CV.overlay({ wide: true });
    ctx = { box, close: c, tab };
    box.append(h('h3', { text: 'CareVision Services' }),
      h('p', { class: 'cv-note', text: 'Pick a service. Prices are demo prices in rupees.' }),
      h('div', { class: 'hub-tabs', id: 'hubTabs' }), h('div', { class: 'hub-grid', id: 'hubGrid' }));
    if (!catalog) {
      try { catalog = (await CareVisionAPI.catalog()).catalog; }
      catch (e) { document.getElementById('hubGrid').append(h('p', { class: 'cv-error', text: 'Could not load services: ' + e.message })); return; }
    }
    render(tab);
  }
  function close() { if (ctx) { ctx.close(); ctx = null; } }

  function render(tab) {
    const tabs = document.getElementById('hubTabs'), grid = document.getElementById('hubGrid');
    if (!tabs || !grid) return;
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `hub-tab${id === tab ? ' active' : ''}`, text: label, onclick: () => render(id) })));
    grid.replaceChildren(...catalog[tab].map(item => h('div', { class: 'hub-item' },
      h('div', { class: 'hub-tag', text: item.tag }),
      h('h4', { text: item.title }),
      h('p', { text: item.desc }),
      h('div', { class: 'hub-foot' },
        h('strong', { text: item.price ? CV.inr(item.price) : 'Custom quote' }),
        h('button', { class: 'btn-primary', text: BUTTON[tab], onclick: () => book(tab, item) })))));
    if (tab === 'scan') grid.append(h('p', { class: 'hub-hint', text: 'Already have a scan or report? Use the free AI Scan & Report Analyst.' },
      ' ', h('a', { href: '#agents', text: 'Open it', onclick: (e) => { e.preventDefault(); close(); CV.goAgent('agentImagingCard'); } })));
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function book(type, item) {
    if (!CareVisionAPI.isLoggedIn()) return CareVisionAuth.open('Please log in to book this service');
    const user = CareVisionAPI.getUser();
    const phone = { name: 'phone', label: 'Mobile number', type: 'tel', required: true, placeholder: '10-digit number', maxlength: 15 };
    const fields = {
      lab: [{ name: 'date', label: 'Preferred date', type: 'date', required: true, min: today() }, phone,
            { name: 'address', label: 'Home address for sample collection', type: 'textarea', required: true }],
      scan: [{ name: 'date', label: 'Preferred date', type: 'date', required: true, min: today() }, phone,
             { name: 'notes', label: 'Doctor referral / reason (optional)', type: 'textarea' }],
      careplan: [phone, { name: 'notes', label: 'Health goals or conditions (optional)', type: 'textarea' }],
      corporate: [{ name: 'company', label: 'Company name', required: true }, { name: 'employees', label: 'Number of employees', type: 'number', required: true, min: 1 }, phone]
    }[type];

    CV.formModal({
      title: item.title,
      intro: item.price ? `${CV.inr(item.price)} · ${item.tag}. Payment is collected at confirmation (demo).` : 'Our team will send a custom quote.',
      fields, submitText: BUTTON[type],
      onSubmit: async (v) => {
        const { request } = await CareVisionAPI.createRequest({
          type, itemId: item.id, preferredDate: v.date, notes: v.notes,
          contact: { name: user.name, phone: v.phone, address: v.address, company: v.company, employees: v.employees }
        });
        close();
        done(request);
      }
    });
  }

  function done(request) {
    CV.infoModal('Request received ✅', [`${request.title}`, `Reference: CV-${String(request._id).slice(-6).toUpperCase()}`,
      'Our team will confirm shortly. You can track it any time in your dashboard under "Orders & Services".'],
      [{ text: 'View my orders', primary: true, fn: () => Dash.open('orders') }, { text: 'Done' }]);
  }

  // Replaces the old "simulated" checkout in script.js - now a real, saved order
  window.checkoutMedicines = function () {
    if (!state.cart.length) return CV.toast('Your cart is empty. Add a medicine first.', 'warn');
    if (!CareVisionAPI.isLoggedIn()) return CareVisionAuth.open('Please log in to place your medicine order');
    const total = state.cart.reduce((s, i) => s + Number(i.carevision) * i.qty, 0);
    const hasRx = state.cart.some(i => /rx/i.test(i.name) || i.name.includes('Amoxicillin') || i.name.includes('Atorvastatin'));
    CV.formModal({
      title: 'Confirm medicine order',
      intro: `${state.cart.length} item(s) · ${CV.inr(total)} · pay on delivery.` + (hasRx ? ' Prescription medicines are verified by our pharmacist before dispatch.' : ''),
      fields: [{ name: 'phone', label: 'Mobile number', type: 'tel', required: true }, { name: 'address', label: 'Delivery address', type: 'textarea', required: true }],
      submitText: 'Place order',
      onSubmit: async (v) => {
        const { request } = await CareVisionAPI.createRequest({
          type: 'medicine', items: state.cart.map(i => ({ name: i.name, qty: i.qty, price: Number(i.carevision) })),
          contact: { phone: v.phone, address: v.address }
        });
        state.cart = []; renderCart(); closeModal();
        done(request);
      }
    });
  };

  // service cards on the home page
  document.addEventListener('DOMContentLoaded', () => {
    const map = { 'service-labs': 'lab', 'service-scans': 'scan', 'service-care-plans': 'careplan', 'service-corporate': 'corporate' };
    Object.entries(map).forEach(([id, t]) => document.getElementById(id)?.addEventListener('click', () => open(t)));
    document.getElementById('service-skincare')?.addEventListener('click', () => CV.goAgent('agentSkinCard'));
  });

  return { open, close };
})();
