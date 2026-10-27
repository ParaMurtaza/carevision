// Builds the "AI Health Report": normalise any analysis -> advice + recovery outlook -> attach best doctors.
// Uses the local open LLM (Ollama) when it is running; otherwise falls back to the built-in clinical-advice templates.
const llm = require('./agents/llmClient');
const { REPORT } = require('./agents/prompts');
const recommender = require('./doctorRecommender');

const FALLBACK = {
  'General Medicine': {
    outlook: 'Many common conditions such as viral fever, cold or a mild stomach upset improve within 3-7 days with rest and fluids. A doctor can confirm the cause and speed up your recovery. If you are not improving, or you feel worse, get reviewed sooner.',
    dos: ['Rest and sleep 7-8 hours', 'Drink fluids regularly (water, ORS, soups) unless your doctor says otherwise', 'Eat light, balanced meals', 'Note your temperature and symptoms twice a day', 'Keep a short symptom diary to show your doctor'],
    donts: ['Do not take antibiotics without a prescription', 'Avoid oily, spicy or heavy food', 'Do not ignore symptoms that keep getting worse', 'Avoid strenuous exercise until you feel better'],
    lifestyle: ['Wash hands often', 'Take short walks once you feel stronger', 'Eat small, frequent meals', 'Limit screen time before sleep'],
    warning: ['Fever above 39°C (102°F) for more than 3 days', 'Difficulty breathing', 'Repeated vomiting or unable to keep fluids down', 'Confusion or extreme drowsiness', 'Very little urine, dry mouth or dizziness (dehydration)']
  },
  Dermatology: {
    outlook: 'Many skin concerns such as mild eczema, irritation or acne improve over 1-4 weeks once the trigger is found and a gentle routine is followed. Some conditions need a dermatologist to examine the skin closely to be sure, so do not rely on a photo alone.',
    dos: ['Use a gentle, fragrance-free cleanser', 'Moisturise daily', 'Use sunscreen SPF 30+ outdoors', 'Take a dated photo weekly to track change', 'Patch-test any new product first'],
    donts: ['Do not scratch or pick the area', 'Avoid steroid creams without a prescription', 'Avoid harsh scrubs and many new products at once', 'Do not pop or burst any blisters'],
    lifestyle: ['Take lukewarm (not hot) showers', 'Wear soft cotton clothing', 'Drink enough water', 'Manage stress and sleep well'],
    warning: ['A spot or mole that changes size, colour or border', 'Bleeding or a sore that does not heal in 3 weeks', 'Rapidly spreading rash', 'Rash with fever', 'Swelling of face or lips']
  },
  Cardiology: {
    outlook: 'Heart-related symptoms deserve timely assessment. Many causes can be managed once identified, and some turn out to be non-cardiac (for example acidity or muscle strain). Your doctor will probably suggest simple tests such as an ECG and blood pressure review; many people feel reassured or start effective treatment quickly.',
    dos: ['Rest and avoid exertion until you are assessed', 'Keep a list of your medicines to show the doctor', 'Note when symptoms occur and what triggers them', 'Check your blood pressure and pulse if you have a device', 'Keep someone informed about how you feel'],
    donts: ['Do not exercise strenuously', 'Avoid smoking and alcohol', 'Avoid very heavy meals', 'Do not ignore chest discomfort or breathlessness'],
    lifestyle: ['Choose a low-salt diet with fruits and vegetables', 'Walk 30 minutes daily once your doctor clears you', 'Keep a healthy weight', 'Practise stress control such as breathing exercises'],
    warning: ['Chest pain or pressure spreading to arm, jaw or back', 'Breathlessness at rest', 'Fainting or near-fainting', 'Cold sweat with chest discomfort', 'Sudden weakness on one side of the body']
  },
  Pediatrics: {
    outlook: 'Most common childhood illnesses such as colds, mild fevers and tummy upsets improve within a few days with rest and fluids. Children can get worse quickly, so close watching matters and a paediatrician can guide the right treatment.',
    dos: ['Offer small, frequent sips of fluids', 'Let the child rest', 'Record temperature and feeding/urine through the day', 'Use only child doses advised by a doctor or the product label', 'Keep vaccinations up to date'],
    donts: ['Never give aspirin to a child', 'Do not give adult medicines', 'Do not over-bundle a child with fever', 'Avoid antibiotics unless prescribed'],
    lifestyle: ['Offer balanced, age-appropriate meals', 'Keep a regular sleep routine', 'Teach hand washing', 'Keep sick children home from school'],
    warning: ['Fever in a baby under 3 months', 'Fast or difficult breathing', 'Refusing to drink or no wet nappy for 8 hours', 'Very sleepy or hard to wake', 'Rash that does not fade when pressed, or a seizure']
  }
};

const FOLLOW = {
  routine: 'Book a consultation within the next few days, especially if symptoms continue or return.',
  soon: 'Please see a doctor within 24-48 hours. Go sooner if symptoms get worse.',
  urgent: 'Please see a doctor today. If symptoms are severe or getting worse, go to the nearest emergency department or call 112.'
};

const arr = (v, n = 6) => (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 240)).filter(Boolean).slice(0, n);
const str = (v, n = 600) => String(v || '').slice(0, n);

// Different tools use different field names - convert all to one shape.
function normalise(source, a) {
  const levelMap = { High: 'urgent', Moderate: 'soon', Low: 'routine' };
  if (source === 'symptom') {
    return {
      speciality: a.suggestedSpeciality || 'General Medicine',
      urgency: levelMap[a.triageLevel] || 'routine',
      summary: str(a.notes) || `Reported symptoms: ${arr(a.symptoms).join(', ')}`,
      findings: [...arr(a.symptoms), a.severity ? `Severity ${a.severity}/10` : '', a.duration && a.duration !== 'Unknown' ? `Duration: ${a.duration}` : ''].filter(Boolean)
    };
  }
  const urgency = ['routine', 'soon', 'urgent'].includes(a.urgency) ? a.urgency : 'routine';
  if (source === 'skin') {
    return { speciality: 'Dermatology', urgency, summary: str(a.summary),
      findings: [...arr(a.visibleFeatures), ...arr((a.possibleConditions || []).map(c => `${c.name} (${c.likelihood})`), 3)] };
  }
  return { speciality: str(a.recommendedSpecialist, 60) || 'General Medicine', urgency, summary: str(a.summary),
    findings: [...arr(a.abnormalValues), ...arr(a.observations), ...arr(a.possibleConcerns, 3)] };
}

async function build({ source, analysis, user }) {
  const n = normalise(source, analysis);
  const base = FALLBACK[n.speciality] || FALLBACK['General Medicine'];
  const out = {
    headline: n.summary ? n.summary.split(/(?<=[.!?])\s/)[0].slice(0, 160) : `Preliminary ${n.speciality} assessment`,
    whatItMeans: `These findings may relate to ${n.speciality} concerns. They are a starting point for your doctor to examine - not a diagnosis - and the right tests will confirm what is going on.`,
    recoveryOutlook: base.outlook, dos: base.dos, donts: base.donts, lifestyle: base.lifestyle,
    warningSigns: base.warning, followUp: FOLLOW[n.urgency]
  };
  if (n.summary && n.summary.length > out.headline.length + 5) out.whatItMeans = `${n.summary} ${out.whatItMeans}`;
  let mode = 'demo';

  if (llm.isEnabled()) {
    try {
      const text = await llm.callLLM({
        system: REPORT, json: true, maxTokens: 1200, timeoutMs: 120000,
        messages: [{ role: 'user', content: `Source: ${source}\nUrgency: ${n.urgency}\nSpeciality: ${n.speciality}\nFindings: ${JSON.stringify(n.findings)}\nSummary: ${n.summary}` }]
      });
      const j = llm.parseJson(text);
      out.headline = str(j.headline, 200) || out.headline;
      out.whatItMeans = str(j.whatItMeans) || out.whatItMeans;
      out.recoveryOutlook = str(j.recoveryOutlook) || out.recoveryOutlook;
      if (arr(j.dos).length) out.dos = arr(j.dos);
      if (arr(j.donts).length) out.donts = arr(j.donts);
      if (arr(j.lifestyle).length) out.lifestyle = arr(j.lifestyle);
      if (arr(j.warningSigns).length) out.warningSigns = arr(j.warningSigns);
      out.followUp = str(j.followUp, 300) || out.followUp;
      mode = 'ai';
    } catch (e) { /* AI unavailable: the template advice above is still medically conservative */ }
  }

  const doctors = await recommender.recommend({ speciality: n.speciality, urgency: n.urgency });
  return {
    mode,
    report: {
      title: 'AI Health Report', source, generatedAt: new Date().toISOString(),
      patient: { name: user.name }, urgency: n.urgency, speciality: n.speciality,
      keyFindings: n.findings.slice(0, 10), ...out, recommendedDoctors: doctors,
      disclaimer: 'This report is AI-assisted pre-screening, not a medical diagnosis or prescription. A qualified doctor must confirm all findings. In an emergency call 112. Doctor ratings, fees and availability shown are sample data for this college project.'
    }
  };
}

module.exports = { build, normalise };
