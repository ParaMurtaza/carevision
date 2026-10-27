// Small open models do not always follow the JSON format perfectly. These helpers force every
// answer into the exact shape the website expects, so one bad answer can never break the page.
const URGENCY = ['routine', 'soon', 'urgent'];

const str = (v, n = 600) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? Object.values(v).join(' ') : String(v)).trim().slice(0, n);
const arr = (v, n = 8, len = 300) => {
  const list = Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []);
  return list.map(x => str(x, len)).filter(x => x && !/^(none|n\/a|na|null|nil|-+)\.?$/i.test(x)).slice(0, n);
};
const urgency = (v) => { const u = str(v, 20).toLowerCase(); return URGENCY.includes(u) ? u : 'routine'; };
const bump = (u, to) => (URGENCY.indexOf(to) > URGENCY.indexOf(u) ? to : u);

const SPECIALITIES = ['General Medicine', 'Dermatology', 'Cardiology', 'Pediatrics'];
function speciality(v, fallback = 'General Medicine') {
  const s = str(v, 60).toLowerCase();
  const hit = SPECIALITIES.find(x => s.includes(x.toLowerCase()) || x.toLowerCase().includes(s) && s.length > 3);
  if (hit) return hit;
  if (/cardio|heart/.test(s)) return 'Cardiology';
  if (/skin|derma/.test(s)) return 'Dermatology';
  if (/child|pedia|paed/.test(s)) return 'Pediatrics';
  return fallback;
}

function normalizeImaging(j = {}) {
  const r = {
    documentType: str(j.documentType, 120) || 'Unknown',
    imageQuality: str(j.imageQuality, 160) || 'not stated',
    observations: arr(j.observations),
    abnormalValues: arr(j.abnormalValues),
    possibleConcerns: arr(j.possibleConcerns, 4),
    urgency: urgency(j.urgency),
    recommendedSpecialist: speciality(j.recommendedSpecialist),
    summary: str(j.summary, 700) || 'The AI could not produce a clear summary. A doctor should review this file.',
    doctorNote: str(j.doctorNote, 500),
    limitations: str(j.limitations, 400)
  };
  // safety net: concerning wording must never be left as "routine"
  const text = [...r.observations, ...r.possibleConcerns, r.summary].join(' ');
  if (/fracture|mass|tumou?r|hemorrhage|haemorrhage|bleed|pneumothorax|infarct|stroke|malignan|embol/i.test(text)) r.urgency = bump(r.urgency, 'soon');
  if (!/radiolog|doctor|clinician|physician/i.test(r.limitations)) r.limitations = (r.limitations + ' A qualified radiologist or doctor must confirm everything.').trim();
  return r;
}

function normalizeSkin(j = {}) {
  const conditions = (Array.isArray(j.possibleConditions) ? j.possibleConditions : (j.possibleConditions ? [j.possibleConditions] : []))
    .map(c => typeof c === 'string' ? { name: str(c, 80), likelihood: 'possible', why: '' }
      : { name: str(c?.name, 80), likelihood: str(c?.likelihood, 20) || 'possible', why: str(c?.why, 200) })
    .filter(c => c.name).slice(0, 3);
  const r = {
    photoQuality: str(j.photoQuality, 160) || 'not stated',
    visibleFeatures: arr(j.visibleFeatures, 6),
    possibleConditions: conditions,
    urgency: urgency(j.urgency),
    redFlags: arr(j.redFlags, 5),
    selfCareTips: arr(j.selfCareTips, 4),
    seeDoctorIf: arr(j.seeDoctorIf, 3),
    recommendedSpecialist: 'Dermatology',
    summary: str(j.summary, 700) || 'The AI could not produce a clear summary. A dermatologist should examine the area.',
    limitations: str(j.limitations, 400)
  };
  const text = [...r.redFlags, ...conditions.map(c => c.name)].join(' ');
  if (/melanoma|carcinoma|cancer|malignan/i.test(text)) r.urgency = 'urgent';          // safety net
  else if (r.redFlags.length) r.urgency = bump(r.urgency, 'soon');
  if (!/dermatolog|doctor/i.test(r.limitations)) r.limitations = (r.limitations + ' A photo cannot confirm a diagnosis; a dermatologist must examine the skin.').trim();
  return r;
}

module.exports = { str, arr, urgency, speciality, normalizeImaging, normalizeSkin };
