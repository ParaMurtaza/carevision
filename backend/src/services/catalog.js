// The price list lives on the SERVER so patients cannot change prices from the browser.
// (Demo prices in rupees - edit freely.)
const CATALOG = {
  lab: [
    { id: 'lab-cbc',      title: 'Complete Blood Count (CBC)',   price: 350,  desc: 'Checks anaemia, infection and platelets.',               tag: 'Home collection' },
    { id: 'lab-diabetes', title: 'Diabetes Screening (HbA1c + Glucose)', price: 599, desc: 'Average sugar over 3 months plus fasting glucose.', tag: 'Home collection' },
    { id: 'lab-thyroid',  title: 'Thyroid Profile (T3, T4, TSH)', price: 499,  desc: 'Finds an under- or over-active thyroid.',               tag: 'Home collection' },
    { id: 'lab-lipid',    title: 'Lipid Profile',                price: 549,  desc: 'Cholesterol and triglycerides for heart risk.',          tag: 'Fasting 10h' },
    { id: 'lab-vitd',     title: 'Vitamin D + B12',              price: 799,  desc: 'Common deficiencies behind tiredness and bone pain.',    tag: 'Home collection' },
    { id: 'lab-full',     title: 'Full Body Health Checkup',     price: 1999, desc: '60+ parameters: blood, liver, kidney, thyroid, lipids.', tag: 'Best value' }
  ],
  scan: [
    { id: 'scan-xray', title: 'Digital X-ray',   price: 600,  desc: 'Chest, bones and joints. Same-day report.',          tag: 'Same day' },
    { id: 'scan-usg',  title: 'Ultrasound',      price: 1200, desc: 'Abdomen, pelvis, thyroid and more.',                  tag: 'Same day' },
    { id: 'scan-ct',   title: 'CT Scan',         price: 4500, desc: 'Detailed cross-sectional imaging. Prescription needed.', tag: 'Accredited centre' },
    { id: 'scan-mri',  title: 'MRI Scan',        price: 7500, desc: 'Brain, spine and joints. Prescription needed.',      tag: 'Accredited centre' }
  ],
  careplan: [
    { id: 'plan-diabetes', title: 'Diabetes Care Plan',      price: 999,  desc: 'Monthly doctor review, sugar tracking and diet coaching.', tag: 'per month' },
    { id: 'plan-bp',       title: 'Hypertension Care Plan',  price: 799,  desc: 'BP monitoring, medicine reminders, monthly consult.',       tag: 'per month' },
    { id: 'plan-heart',    title: 'Heart Health Plan',       price: 1499, desc: 'Cardiologist follow-ups and lifestyle programme.',          tag: 'per month' },
    { id: 'plan-weight',   title: 'Weight & Lifestyle Plan', price: 899,  desc: 'Nutrition plan, activity goals and check-ins.',             tag: 'per month' }
  ],
  corporate: [
    { id: 'corp-starter', title: 'Starter OPD (up to 50 employees)',  price: null, desc: 'Unlimited tele-consults and health checkups.', tag: 'Get a quote' },
    { id: 'corp-growth',  title: 'Growth OPD (50-500 employees)',     price: null, desc: 'Adds lab tests, medicines and wellness camps.', tag: 'Get a quote' },
    { id: 'corp-ent',     title: 'Enterprise (500+ employees)',       price: null, desc: 'Custom programme with a dedicated manager.',   tag: 'Get a quote' }
  ]
};

exports.CATALOG = CATALOG;
exports.TYPES = Object.keys(CATALOG);
exports.find = (type, id) => (CATALOG[type] || []).find(i => i.id === id);
