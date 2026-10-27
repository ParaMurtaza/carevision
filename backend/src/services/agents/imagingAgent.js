// AGENT 2 - MRI / CT / X-ray / report analyst
//   image -> vision model (gemma3 / llava / llama3.2-vision)
//   PDF   -> text extraction + reliable rule-based lab reader, then the text model explains it
const llm = require('./llmClient');
const { IMAGING } = require('./prompts');
const { normalizeImaging } = require('./normalize');
const reportAnalyzer = require('../reportAnalyzer');

exports.analyse = async (file, notes = '') => {
  const isPdf = file.mimetype === 'application/pdf';
  const text = isPdf ? await reportAnalyzer.textFromBuffer(file.buffer, file.mimetype) : '';
  const rules = isPdf ? reportAnalyzer.analyseText(text) : null;   // deterministic lab flags (trusted numbers)

  if (isPdf && !text.trim()) {
    return demo(file, rules, 'This PDF has no readable text (it is probably a scan). Upload it as a JPG/PNG image instead.');
  }
  if (!llm.isEnabled()) return demo(file, rules, 'The AI engine is switched off.');

  try {
    let raw, vision = !isPdf;
    if (isPdf) {
      raw = await llm.callLLM({
        system: IMAGING, json: true, maxTokens: 1200,
        messages: [{ role: 'user', content:
          `This is the text of a medical report extracted from a PDF:\n"""\n${text.slice(0, 6000)}\n"""\n` +
          `Values already checked by a rule-based reader (trust these numbers): ${JSON.stringify(rules.findings)}\n` +
          `Patient notes: ${notes.slice(0, 500) || 'none'}` }]
      });
    } else {
      raw = await llm.callLLM({
        system: IMAGING, json: true, vision: true, maxTokens: 1200,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Analyse this medical image or report. Patient notes (may be empty): ${notes.slice(0, 500) || 'none'}` },
          llm.imagePart(file)] }]
      });
    }
    const result = normalizeImaging(llm.parseJson(raw));
    if (rules) {   // put the trusted rule-based lab values first and drop any duplicates the model invented
      result.abnormalValues = [...rules.findings.filter(f => !f.includes('Normal')), ...result.abnormalValues].slice(0, 8);
    }
    return { result, mode: 'ai', engine: llm.modelFor(vision) };
  } catch (e) {
    return demo(file, rules, e.message);
  }
};

// AI engine unavailable: PDFs still get the rule-based lab reading; images get an honest notice.
function demo(file, rules, notice) {
  const isPdf = file.mimetype === 'application/pdf';
  const abnormal = rules ? rules.findings.filter(f => !f.includes('Normal')) : [];
  return {
    mode: 'demo', notice,
    result: {
      documentType: isPdf ? 'Report (rule-based reading)' : 'Medical image',
      imageQuality: 'not assessed', observations: [], abnormalValues: abnormal, possibleConcerns: [],
      urgency: abnormal.length ? 'soon' : 'routine', recommendedSpecialist: 'General Medicine',
      summary: rules ? rules.summary : 'The AI vision engine is not available, so this image could not be read. A doctor should review it.',
      doctorNote: 'Basic rule-based output only.', limitations: 'A qualified doctor or radiologist must review this file.'
    }
  };
}
