// AI layer #2: medical report analyzer.
// Reads text from a PDF/TXT and flags common lab findings using reference ranges.
const fs = require('fs');

// name pattern -> [low, high, label]
const LAB_RULES = [
  { name: 'Hemoglobin', re: /h(a)?emoglobin[^\d]{0,15}([\d.]+)/i, low: 12, high: 17.5, unit: 'g/dL' },
  { name: 'Fasting Glucose', re: /(fasting\s+)?(blood\s+)?glucose[^\d]{0,15}([\d.]+)/i, low: 70, high: 100, unit: 'mg/dL' },
  { name: 'Total Cholesterol', re: /cholesterol[^\d]{0,15}([\d.]+)/i, low: 0, high: 200, unit: 'mg/dL' },
  { name: 'WBC Count', re: /(wbc|white blood cell)[^\d]{0,15}([\d.]+)/i, low: 4000, high: 11000, unit: '/uL' },
  { name: 'Platelets', re: /platelet[^\d]{0,15}([\d.]+)/i, low: 150000, high: 450000, unit: '/uL' }
];

// pdfjs-dist (Mozilla's PDF engine). The older "pdf-parse" package fails on many real PDFs with current Node versions.
let pdfjs;
function loadPdfjs() {
  if (!pdfjs) {
    const { warn, log } = console; console.warn = console.log = () => {};   // it prints harmless "cannot polyfill canvas" notices
    try { pdfjs = require('pdfjs-dist/legacy/build/pdf.js'); } finally { console.warn = warn; console.log = log; }
  }
  return pdfjs;
}

async function pdfText(buffer) {
  const doc = await loadPdfjs().getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true, verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 15); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out += content.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  return out;
}

// Text from an uploaded buffer (PDF text layer or plain text). Images need a vision model instead.
async function textFromBuffer(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') return await pdfText(buffer);
    if (mimetype === 'text/plain') return buffer.toString('utf8');
  } catch (e) { console.error('PDF text extraction failed:', e.message); }
  return '';
}

// Pure rule-based reading of lab values in text (reliable numbers, no AI involved)
function analyseText(text) {
  if (!text || !text.trim()) {
    return { summary: 'Could not read text from this file (images need the AI vision model). A doctor will review it manually.', findings: [] };
  }
  const findings = [];
  for (const rule of LAB_RULES) {
    const m = text.match(rule.re);
    if (!m) continue;
    const value = parseFloat(m[m.length - 1]);
    if (Number.isNaN(value)) continue;
    const status = value < rule.low ? 'LOW' : value > rule.high ? 'HIGH' : 'Normal';
    findings.push(`${rule.name}: ${value} ${rule.unit} (${status}, normal ${rule.low}-${rule.high})`);
  }
  const abnormal = findings.filter(f => !f.includes('Normal'));
  const summary = findings.length === 0
    ? 'No standard lab values were recognised. A doctor will review the report.'
    : abnormal.length === 0
      ? 'All recognised values are within normal range.'
      : `${abnormal.length} value(s) outside normal range - please consult a doctor.`;
  return { summary, findings };
}

async function analyse(filePath, mimetype) {
  return analyseText(await textFromBuffer(fs.readFileSync(filePath), mimetype));
}

module.exports = { analyse, analyseText, textFromBuffer };
