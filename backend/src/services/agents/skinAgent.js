// AGENT 3 - skin analysis (vision model)
const llm = require('./llmClient');
const { SKIN } = require('./prompts');
const { normalizeSkin } = require('./normalize');

exports.analyse = async (file, notes = '') => {
  if (file.mimetype === 'application/pdf') {
    throw Object.assign(new Error('Please upload a photo (JPG, PNG or WEBP) of the skin area'), { status: 400 });
  }
  if (!llm.isEnabled()) return demo('The AI engine is switched off.');
  try {
    const raw = await llm.callLLM({
      system: SKIN, json: true, vision: true, maxTokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'text', text: `Analyse this skin photo. Patient notes (may be empty): ${notes.slice(0, 500) || 'none'}` },
        llm.imagePart(file)] }]
    });
    return { result: normalizeSkin(llm.parseJson(raw)), mode: 'ai', engine: llm.modelFor(true) };
  } catch (e) { return demo(e.message); }
};

function demo(notice) {
  return {
    mode: 'demo', notice,
    result: {
      photoQuality: 'not assessed', visibleFeatures: [], possibleConditions: [], urgency: 'routine', redFlags: [],
      selfCareTips: ['Keep the area clean and avoid scratching.'], seeDoctorIf: ['It changes, bleeds or does not heal'],
      recommendedSpecialist: 'Dermatology',
      summary: 'The AI vision engine is not available, so the photo could not be analysed. You can still book a dermatologist.',
      limitations: 'Photos cannot confirm a diagnosis.'
    }
  };
}
