// "Which doctor is best for me?" - transparent scoring, easy to explain in a viva.
//   +60 speciality matches the AI result      +15 general physician as a safe fallback
//   +rating (max 30)   +experience (completed consults, max 10)
//   +free slots (max 12, doubled when urgent)  -fee penalty (only when not urgent)
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

function rank(doctors, completedCounts, { speciality = 'General Medicine', urgency = 'routine' }, limit = 3) {
  const want = String(speciality).toLowerCase();
  const urgent = urgency === 'urgent' || urgency === 'soon';

  const scored = doctors.map(d => {
    const reasons = [];
    let score = 0;
    const match = d.specialty.toLowerCase() === want || want.includes(d.specialty.toLowerCase()) || d.specialty.toLowerCase().includes(want);
    if (match) { score += 60; reasons.push(`Specialises in ${d.specialty}`); }
    else if (d.specialty === 'General Medicine') { score += 15; reasons.push('General physician - a good first step'); }

    score += Math.min(d.rating, 5) * 6;
    reasons.push(`Rated ${d.rating.toFixed(1)}/5 by patients`);

    const done = completedCounts[String(d._id)] || 0;
    if (done > 0) { score += Math.min(done, 20) * 0.5; reasons.push(`${done} consultation${done > 1 ? 's' : ''} completed on CareVision`); }

    const slots = (d.availability || []).length;
    score += Math.min(slots, 8) * (urgent ? 3 : 1.5);
    if (slots) reasons.push(urgent ? `${slots} slots open - can see you soon` : `${slots} slots available`);

    if (!urgent) score -= d.consultFee / 200;
    reasons.push(`Consultation fee ₹${d.consultFee}`);

    return {
      score: Math.round(score),
      reasons,
      doctor: { id: d._id, name: d.name, specialty: d.specialty, rating: d.rating, consultFee: d.consultFee, avatar: d.avatar, slots: d.availability }
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s, i) => ({ ...s, label: i === 0 ? 'Best match' : i === 1 ? 'Good match' : 'Alternative' }));
}

async function recommend(opts, limit = 3) {
  const [doctors, completed] = await Promise.all([Doctor.find({}), Appointment.find({ status: 'completed' }, 'doctorId')]);
  const counts = {};
  completed.forEach(a => { counts[String(a.doctorId)] = (counts[String(a.doctorId)] || 0) + 1; });
  return rank(doctors, counts, opts, limit);
}

module.exports = { recommend, rank };
