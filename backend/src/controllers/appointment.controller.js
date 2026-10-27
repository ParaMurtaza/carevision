const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Report = require('../models/Report');
const AgentResult = require('../models/AgentResult');

// The brief comes from the browser, so it is whitelisted and trimmed before it is stored
// (a doctor will read it later - never trust or store arbitrary client data).
const TRIAGE = ['Low', 'Moderate', 'High'];
const str = (v, n) => String(v ?? '').slice(0, n);
function cleanBrief(b = {}) {
  return {
    symptoms: (Array.isArray(b.symptoms) ? b.symptoms : []).slice(0, 12).map(x => str(x, 80)).filter(Boolean),
    severity: Math.min(Math.max(Number(b.severity) || 0, 0), 10),
    duration: str(b.duration, 60),
    history: str(b.history, 300),
    triageLevel: TRIAGE.includes(b.triageLevel) ? b.triageLevel : 'Low',   // "Awaiting Data" -> Low
    notes: str(b.notes, 600),
    chatLog: (Array.isArray(b.chatLog) ? b.chatLog : []).slice(-40)
      .filter(m => m && ['ai', 'user'].includes(m.sender)).map(m => ({ sender: m.sender, text: str(m.text, 500) }))
  };
}

// POST /api/appointments   (patient)
exports.book = async (req, res, next) => {
  try {
    const { doctorId, doctorName, date, slot, symptomBrief } = req.body;
    if (!date || !slot) return res.status(400).json({ message: 'Date and time slot are required' });

    // The frontend can send either the id or the doctor's name
    const doctor = doctorId ? await Doctor.findById(doctorId) : await Doctor.findOne({ name: doctorName });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    // Jitsi rooms work instantly with no account/API key
    const meetLink = `https://meet.jit.si/CareVision-${crypto.randomBytes(5).toString('hex')}`;

    // Application-level check (the unique DB index is the safety net for two simultaneous requests)
    if (await Appointment.exists({ doctorId: doctor._id, date, slot, status: 'booked' })) {
      return res.status(409).json({ message: 'That slot is already booked. Please choose another time.' });
    }

    const appointment = await Appointment.create({
      userId: req.user._id, doctorId: doctor._id, date, slot, symptomBrief: cleanBrief(symptomBrief), meetLink
    });
    res.status(201).json({ appointment, doctor });
  } catch (err) {
    if (err.code === 11000) err.message = 'That slot is already booked. Please choose another time.';
    next(err);
  }
};

// GET /api/appointments/mine   (patient)
exports.mine = async (req, res, next) => {
  try {
    const appointments = await Appointment.find({ userId: req.user._id })
      .populate('doctorId', 'name specialty consultFee').sort({ createdAt: -1 });
    res.json({ appointments });
  } catch (err) { next(err); }
};

// GET /api/appointments/queue   (doctor) - patients waiting, highest triage first
exports.queue = async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'No doctor profile linked to this account' });

    const status = req.query.status === 'completed' ? 'completed' : 'booked';
    const list = await Appointment.find({ doctorId: doctor._id, status }).populate('userId', 'name email phone');
    if (status === 'booked') {
      const rank = { High: 0, Moderate: 1, Low: 2 };
      list.sort((a, b) => (rank[a.symptomBrief?.triageLevel] ?? 3) - (rank[b.symptomBrief?.triageLevel] ?? 3));
    } else {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    res.json({ queue: list });
  } catch (err) { next(err); }
};

// PATCH /api/appointments/:id/complete   (doctor)  body: { diagnosis, prescription: [string], followUp }
exports.complete = async (req, res, next) => {
  try {
    const diagnosis = str(req.body.diagnosis, 1000).trim();
    if (!diagnosis) return res.status(400).json({ message: 'Diagnosis is required' });
    const prescription = (Array.isArray(req.body.prescription) ? req.body.prescription : [])
      .slice(0, 15).map(p => str(p, 200).trim()).filter(Boolean);

    const doctor = await Doctor.findOne({ user: req.user._id });
    // only this doctor's own, still-open appointments can be completed (a case cannot be closed twice)
    const appt = await Appointment.findOne({ _id: req.params.id, doctorId: doctor?._id, status: 'booked' });
    if (!appt) return res.status(404).json({ message: 'Open appointment not found for this doctor' });

    appt.status = 'completed';
    appt.diagnosis = diagnosis;
    appt.prescription = prescription;
    appt.followUp = str(req.body.followUp, 300).trim();
    await appt.save();
    res.json({ appointment: appt });
  } catch (err) { next(err); }
};

// PATCH /api/appointments/:id/cancel   (patient)
exports.cancel = async (req, res, next) => {
  try {
    const appt = await Appointment.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: 'booked' },
      { status: 'cancelled' }, { new: true });
    if (!appt) return res.status(404).json({ message: 'Booked appointment not found' });
    res.json({ appointment: appt });
  } catch (err) { next(err); }
};

// GET /api/appointments/patient/:userId/records   (ONLY a doctor who has an appointment with this patient - the admin panel never exposes medical records)
// A doctor can ONLY see patients who booked with them - this is the "limited access" rule.
exports.patientRecords = async (req, res, next) => {
  try {
    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ user: req.user._id });
      const linked = doctor && await Appointment.exists({ doctorId: doctor._id, userId: req.params.userId });
      if (!linked) return res.status(403).json({ message: 'You can only view patients who booked with you' });
    }
    const uid = req.params.userId;
    const [patient, reports, results] = await Promise.all([
      User.findById(uid, 'name email phone'),
      Report.find({ userId: uid }).sort({ uploadedAt: -1 }).limit(10),
      AgentResult.find({ userId: uid }).sort({ createdAt: -1 }).limit(10)
    ]);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.json({ patient, reports, results });
  } catch (err) { next(err); }
};
