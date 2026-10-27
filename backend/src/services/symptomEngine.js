// AI layer #1: symptom engine (rule-based NLP).
// Same idea as the frontend chat, but running on the server so doctors get a trusted brief.

const SYMPTOM_KEYWORDS = [
  'fever', 'headache', 'cough', 'cold', 'stomach', 'vomit', 'nausea', 'chest pain',
  'breath', 'rash', 'fatigue', 'weakness', 'dizziness', 'sore throat', 'diarrhea', 'itching'
];

// speciality -> trigger words and base risk weight
const RULES = [
  { speciality: 'Cardiology',       words: ['chest', 'heart', 'palpitation', 'breath'], weight: 3 },
  { speciality: 'Dermatology',      words: ['skin', 'rash', 'itch', 'spots', 'acne'],   weight: 1 },
  { speciality: 'Pediatrics',       words: ['child', 'baby', 'infant', 'toddler'],      weight: 2 },
  { speciality: 'General Medicine', words: ['fever', 'stomach', 'vomit', 'nausea', 'cough', 'cold', 'headache'], weight: 2 }
];

const EMERGENCY_WORDS = ['unconscious', 'severe chest pain', "can't breathe", 'cannot breathe', 'bleeding heavily', 'stroke'];

// keyword -> friendly name shown to doctors and in reports
const DISPLAY = { breath: 'shortness of breath', vomit: 'vomiting', stomach: 'stomach pain', cold: 'cold / runny nose' };

function extractSymptoms(text) {
  const t = text.toLowerCase();
  const found = SYMPTOM_KEYWORDS.filter(s => t.includes(s)).map(s => DISPLAY[s] || s);
  return found.length ? found : ['general malaise'];
}

function analyse({ text = '', severity = 5, duration = 'Unknown', history = 'None reported' }) {
  const t = text.toLowerCase();
  const symptoms = extractSymptoms(t);

  // Score every speciality, pick the best match
  let best = { speciality: 'General Medicine', score: 0 };
  for (const rule of RULES) {
    const hits = rule.words.filter(w => t.includes(w)).length;
    const score = hits * rule.weight;
    if (score > best.score) best = { speciality: rule.speciality, score };
  }

  // Triage level from severity + risk of the chosen speciality
  const sev = Math.min(Math.max(parseInt(severity, 10) || 5, 1), 10);
  let triage = 'Low';
  if (sev >= 7 || (best.speciality === 'Cardiology' && sev >= 5)) triage = 'High';
  else if (sev >= 4) triage = 'Moderate';

  const emergency = EMERGENCY_WORDS.some(w => t.includes(w));
  if (emergency) triage = 'High';

  return {
    symptoms,
    severity: sev,
    duration,
    history,
    triageLevel: triage,
    suggestedSpeciality: best.speciality,
    emergency,
    notes: `Patient reports ${symptoms.join(', ')} rated ${sev}/10 for ${duration}. History: ${history}. ` +
           `Suggested department: ${best.speciality}. Triage: ${triage}.`,
    disclaimer: 'AI pre-assessment only. This is not a medical diagnosis.'
  };
}

module.exports = { analyse };
